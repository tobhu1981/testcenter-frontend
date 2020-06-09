import {Inject, Injectable, OnDestroy} from '@angular/core';
import {BehaviorSubject, Observable, of, Subscription} from 'rxjs';
import {catchError, map, skipWhile, tap} from 'rxjs/operators';
import {ApiError, BookletData} from '../app.interfaces';
import {HttpClient, HttpResponse} from '@angular/common/http';
import {StatusUpdate} from './group-monitor.interfaces';
import {WebsocketService} from './websocket.service';

export type ConnectionStatus = "initial" | "ws-offline" | "ws-online" | "polling-sleep" | "polling-fetch" | "error";


@Injectable()
export class BackendService extends WebsocketService implements OnDestroy {

  public sessions$: BehaviorSubject<StatusUpdate[]>;
  public connectionStatus$: BehaviorSubject<ConnectionStatus> = new BehaviorSubject<ConnectionStatus>("initial");

  private wsStatusSubscription: Subscription = null;
  private wsSessionsSubscription: Subscription = null;

  constructor(
      @Inject('SERVER_URL') private serverUrl: string,
      private http: HttpClient
  ) {
    super();
  }


  ngOnDestroy() {

      this.unsubscribeFromWebsocket();
  }


  getBooklet(bookletName: string): Observable<BookletData | boolean> {

    console.log("load booklet for " + bookletName);

    return this.http
        .get<BookletData>(this.serverUrl + `booklet/${bookletName}/data`)
        .pipe(
            catchError((err: ApiError) => {
              console.warn(`getTestData Api-Error: ${err.code} ${err.info}`);
              return of(false)
            })
        );
  }


    // stand
    // - auf connection lost reagieren
    // - webserive aufräumen (abstralte ws-variante?)
    // - identification nutzen
    // - abstrahieren
    // - errors


  getSessions(): Observable<StatusUpdate[]> {

    console.log("load monitor for ");
    if (!this.sessions$) {

      this.sessions$ = new BehaviorSubject<StatusUpdate[]>([]);
    }

    this.unsubscribeFromWebsocket();

    this.connectionStatus$.next("polling-fetch");

    this.http
        .get<StatusUpdate[]>(this.serverUrl + `/workspace/1/sessions`, {observe: 'response'})
        .pipe(
            catchError((err: ApiError) => {
                console.warn(`getState Api-Error: ${err.code} ${err.info}`);
                this.connectionStatus$.next("error");
                return of([])
            })
        )
        .subscribe((response: HttpResponse<StatusUpdate[]>) => {

            console.log("headers", response.headers);

            this.sessions$.next(response.body);

            if (response.headers.has('SubscribeURI')) {

                console.log('switch to websocket-mode');
                this.urlParam = response.headers.get('SubscribeURI');
                this.subScribeToStatusUpdateWsChannel();

            } else {

                this.connectionStatus$.next("polling-sleep");
                setTimeout(() => this.getSessions(), 5000);
            }
        })


    return this.sessions$;


  }


  private unsubscribeFromWebsocket() {

      if (this.wsStatusSubscription) {
          this.wsStatusSubscription.unsubscribe();
      }

      if (this.wsSessionsSubscription) {
          this.wsSessionsSubscription.unsubscribe();
      }
  }


  private subScribeToStatusUpdateWsChannel() {

      this.wsSessionsSubscription = this.getChannel<StatusUpdate[]>('status')
          .subscribe((sessionStatus: StatusUpdate[]) => this.sessions$.next(sessionStatus)); // subscribe only next, not complete!

      this.wsStatusSubscription = this.serviceConnected$
          .pipe(
              skipWhile((item: boolean) => item === null), // skip pre-init-state
              tap((wsConnected: boolean) => {
                  if (!wsConnected) {
                      console.log('switch to polling-mode');
                      this.connectionStatus$.next("polling-sleep");
                      setTimeout(() => this.getSessions(), 5000);
                  }
              }),
              map((wsConnected: boolean): ConnectionStatus => wsConnected ? "ws-online" : "ws-offline")
          )
          .subscribe(this.connectionStatus$);
  }

}
