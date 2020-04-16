import {Component, OnDestroy, OnInit} from '@angular/core';
import {MainDataService} from "../../maindata.service";
import {Router} from "@angular/router";
import {AuthAccessKeyType, AuthData, WorkspaceData} from "../../app.interfaces";
import {from, Subscription} from "rxjs";
import {concatMap} from "rxjs/operators";
import {BackendService} from "../../backend.service";


@Component({
  templateUrl: './admin-starter.component.html',
})

export class AdminStarterComponent implements OnInit, OnDestroy {
  workspaces: WorkspaceData[] = [];
  isSuperAdmin = false;
  private getWorkspaceDataSubscription: Subscription = null;

  constructor(
    private router: Router,
    private bs: BackendService,
    private mds: MainDataService
  ) { }

  ngOnInit() {
    setTimeout(() => {
      this.bs.getSessionData().subscribe(authDataUntyped => {
        if (typeof authDataUntyped !== 'number') {
          const authData = authDataUntyped as AuthData;
          if (authData) {
            if (authData.token) {
              if (authData.access[AuthAccessKeyType.SUPER_ADMIN]) {
                this.isSuperAdmin = true;
              }
              if (authData.access[AuthAccessKeyType.WORKSPACE_ADMIN]) {
                this.workspaces = [];
                this.getWorkspaceDataSubscription = from(authData.access[AuthAccessKeyType.WORKSPACE_ADMIN]).pipe(
                  concatMap(workspaceId => {
                    return this.bs.getWorkspaceData(workspaceId)
                  })).subscribe(wsData => this.workspaces.push(wsData));
              }
              this.mds.setAuthData(authData);
            } else {
              this.mds.setAuthData();
            }
          } else {
            this.mds.setAuthData();
          }
        }
      })
    });
  }

  buttonGotoWorkspaceAdmin(ws: WorkspaceData) {
    this.router.navigateByUrl('/admin/' + ws.id.toString() + '/files');
  }

  resetLogin() {
    this.mds.setAuthData();
    this.router.navigate(['/']);
  }

  ngOnDestroy() {
    if (this.getWorkspaceDataSubscription !== null) {
      this.getWorkspaceDataSubscription.unsubscribe();
    }
  }
}
