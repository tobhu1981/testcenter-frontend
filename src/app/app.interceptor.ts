import { Injectable } from '@angular/core';
import { Router, RouterState, RouterStateSnapshot } from '@angular/router';
import {
  HttpInterceptor, HttpRequest,
  HttpHandler, HttpEvent, HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MainDataService } from './maindata.service';
import { ApiError } from './app.interfaces';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private mds: MainDataService,
    private router: Router
  ) {}

  // TODO separation of concerns: split into two interceptors,
  // one for error handling, one for auth token addition
  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (this.mds.isApiValid) {
      let tokenStr = '';
      const authData = MainDataService.getAuthData();
      if (authData) {
        if (authData.token) {
          tokenStr = authData.token;
        }
      }

      const requestA = request.clone({
        setHeaders: {
          AuthToken: tokenStr
        }
      });

      return next.handle(requestA).pipe(
        catchError((e) => {
          const apiError = new ApiError(999);
          if (e instanceof HttpErrorResponse) { // TODO is the opposite case even possible?
            const httpError = e as HttpErrorResponse;
            apiError.code = httpError.status;
            apiError.info = httpError.message + ' // ' + httpError.error;
            if (httpError.error instanceof ErrorEvent) {
              this.mds.appError$.next({
                label: 'Fehler in der Netzwerkverbindung',
                description: httpError.message,
                category: 'PROBLEM'
              });
            } else {
              let ignoreError = false;
              let goToLoginPage = false;
              let label = 'Unbekanntes Verbindungsproblem';
              switch (httpError.status) {
                case 202:
                case 204:
                case 207:
                case 400:
                  ignoreError = true;
                  // apiError.info contains error = body
                  break;

                case 401:
                  goToLoginPage = true;
                  label = 'Bitte für diese Aktion erst anmelden!';
                  break;

                case 403:
                  label = 'Für diese Funktion haben Sie keine Berechtigung.';
                  break;

                case 404:
                  label = 'Daten/Objekt nicht gefunden.';
                  break;

                case 410:
                  goToLoginPage = true;
                  label = 'Anmeldung abgelaufen. Bitte erneut anmelden!';
                  break;

                case 422:
                  ignoreError = true;
                  // apiError.info = ?? TODO - from request body
                  label = 'Die übermittelten Objekte sind fehlerhaft!';
                  break;

                case 500:
                  label = 'Allgemeines Server-Problem.';
                  break;

              }
              if (!ignoreError) {
                if (goToLoginPage) {
                  console.warn('AuthError' + httpError.status + ' (' + label + ')');
                  MainDataService.resetAuthData();
                  const state: RouterState = this.router.routerState;
                  const snapshot: RouterStateSnapshot = state.snapshot;
                  this.router.navigate(['/r/login', snapshot.url]);
                } else {
                  this.mds.appError$.next({
                    label: label,
                    description: httpError.message,
                    category: 'PROBLEM'
                  });
                }
              }
            }
          }

          return throwError(apiError);
        })
      );
    } else {
      this.mds.appError$.next({
        label: 'Server-Problem: API-Version ungültig',
        description: 'Keine weiteren Server-Aufrufe erlaubt',
        category: 'FATAL'
      });
      return throwError(new ApiError(500, 'API-Version ungültig'));
    }
  }
}
