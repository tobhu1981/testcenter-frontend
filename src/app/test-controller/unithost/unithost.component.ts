import { debounceTime, bufferTime } from 'rxjs/operators';
import { UnitDef, TestControllerService } from './../test-controller.service';
import { Subscriber, Subscription, BehaviorSubject } from 'rxjs';
import { BackendService, ServerError } from './../backend.service';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { OnDestroy } from '@angular/core/src/metadata/lifecycle_hooks';
import { Location } from '@angular/common';
import { LogindataService } from '../../logindata.service';

@Component({
  templateUrl: './unithost.component.html',
  styleUrls: ['./unithost.component.css']
})

export class UnithostComponent implements OnInit, OnDestroy {
  // private message = 'yoyoyo';

  // public showIframe = false;
  private iFrameHostElement: HTMLElement;
  private iFrameItemplayer: HTMLIFrameElement;
  private routingSubscription: Subscription = null;
  public currentValidPages: string[] = [];
  private myUnitNumber = -1;
  private myUnitName = '';

  // :::::::::::::::::::::
  private postMessageSubscription: Subscription = null;
  private itemplayerSessionId = '';
  private postMessageTarget: Window = null;
  private pendingUnitDefinition$ = new BehaviorSubject<string>('');
  private pendingRestorePoint$ = new BehaviorSubject<string>('');

  // changed by itemplayer via postMessage, observed here to save (see below)
  public restorePoint$ = new BehaviorSubject<string>('');
  public response$ = new BehaviorSubject<string>('');
  public log$ = new BehaviorSubject<string>('');

  constructor(
    private tcs: TestControllerService,
    private bs: BackendService,
    private lds: LogindataService,
    private location: Location,
    private route: ActivatedRoute
  ) {
    this.postMessageSubscription = this.lds.postMessage$.subscribe((m: MessageEvent) => {
      const msgData = m.data;
      const msgType = msgData['type'];

      if ((msgType !== undefined) && (msgType !== null)) {
        switch (msgType) {

          // // // // // // //
          case 'OpenCBA.FromItemPlayer.ReadyNotification':
            let hasData = false;
            const initParams = {};

            const pendingSpec = this.pendingUnitDefinition$.getValue();
            if (pendingSpec.length > 0) {
              hasData = true;
              this.pendingUnitDefinition$.next('');
            }

            if (hasData) {
              this.log$.next('ready');
              const pendingRespp = this.pendingRestorePoint$.getValue();
              if (pendingRespp.length > 0) {
                this.pendingRestorePoint$.next('');
              }

              this.itemplayerSessionId = Math.floor(Math.random() * 20000000 + 10000000).toString();
              this.postMessageTarget = m.source;
              this.postMessageTarget.postMessage({
                type: 'OpenCBA.ToItemPlayer.DataTransfer',
                sessionId: this.itemplayerSessionId,
                unitDefinition: pendingSpec,
                restorePoint: pendingRespp
              }, '*');
            }
            break;

          // // // // // // //
          case 'OpenCBA.FromItemPlayer.StartedNotification':
            const validPages = msgData['validPages'];
            if ((validPages instanceof Array) && (validPages.length > 1)) {
              this.tcs.itemplayerValidPages$.next(validPages);
              let currentPage = msgData['currentPage'];
              if (currentPage  === undefined) {
                currentPage = validPages[0];
              }
              this.tcs.itemplayerCurrentPage$.next(currentPage);
            } else {
              this.tcs.itemplayerValidPages$.next([]);
              this.tcs.itemplayerCurrentPage$.next('');
            }
            break;

          // // // // // // //
          case 'OpenCBA.FromItemPlayer.ChangedDataTransfer':
            const validPagesChanged = msgData['validPages'];
            let currentPageChanged = msgData['currentPage'];
            if ((validPagesChanged instanceof Array)) {
              this.tcs.itemplayerValidPages$.next(validPagesChanged);
              if (currentPageChanged  === undefined) {
                currentPageChanged = validPagesChanged[0];
              }
            }
            if (currentPageChanged !== undefined) {
              this.tcs.itemplayerCurrentPage$.next(currentPageChanged);
            }

            const restorePoint = msgData['restorePoint'];
            if (restorePoint !== undefined) {
              this.restorePoint$.next(restorePoint);
            }
            const response = msgData['response'];
            if (response !== undefined) {
              console.log('got resp ' + response);
              this.response$.next(response);
            }
            // const logEntries = msgData['logEntries'] as string[];
            // if ((logEntries !== undefined) && (logEntries.length > 0)) {
            //   console.log(logEntries);
            //   logEntries.forEach(log => this.log$.next(log));
            // }
            break;

          // // // // // // //
          default:
            console.log('processMessagePost ignored message: ' + msgType);
            break;
        }
      }
    });

    this.restorePoint$.pipe(
      debounceTime(300)).subscribe(data => {
      const b = this.tcs.booklet$.getValue();
      if (b !== null) {
        const u = b.getUnitAt(this.myUnitNumber);
        if (u !== null) {
          u.restorePoint = data;
        }
      }

      this.bs.setUnitRestorePoint(this.lds.authorisation$.getValue(), this.myUnitName, data)
        .subscribe(d => {
          if (d === false) {
            console.log('setUnitRestorePoint: false');
          } else if (d instanceof ServerError) {
            console.log('setUnitRestorePoint: ServerError');
          }
        });
    });

    this.response$.pipe(
      debounceTime(300)
    ).subscribe(data => this.bs.setUnitResponses(this.lds.authorisation$.getValue(), this.myUnitName, data)
        .subscribe(d => {
          if (d === false) {
            console.log('setUnitResponses: false');
          } else if (d instanceof ServerError) {
            console.log('setUnitResponses: ServerError');
          }
        }));

    this.log$.pipe(
      bufferTime(500)
    ).subscribe((data: string[]) => {
      const myLogs = [];
      data.forEach(lg => {
        if (lg.length > 0) {
          myLogs.push(JSON.stringify(lg));
        }
      });
      if (myLogs.length > 0) {
        this.bs.setUnitLog(this.lds.authorisation$.getValue(), this.myUnitName, myLogs).subscribe(d => {
          if (d === false) {
            console.log('setUnitLog: false');
          } else if (d instanceof ServerError) {
            console.log('setUnitLog: ServerError');
          }
        });
      }
    });

    this.tcs.itemplayerPageRequest$.subscribe(newUnitPage => {
      if ((this.postMessageTarget !== null) && (newUnitPage.length > 0)) {
        this.postMessageTarget.postMessage({
          type: 'OpenCBA.ToItemPlayer.PageNavigationRequest',
          sessionId: this.itemplayerSessionId,
          newPage: newUnitPage
        }, '*');
      }
    });
  }

  ngOnInit() {
    this.iFrameHostElement = <HTMLElement>document.querySelector('#iFrameHost');

    this.iFrameItemplayer = null;

    this.routingSubscription = this.route.params.subscribe(params => {
      this.myUnitNumber = +params['u'];
      this.loadItemplayer();
    });

    // this.tcs.currentUnitPos$.subscribe(cu => this.loadItemplayer());
  }

  loadItemplayer() {
    while (this.iFrameHostElement.hasChildNodes()) {
      this.iFrameHostElement.removeChild(this.iFrameHostElement.lastChild);
    }
    const currentUnitId = this.tcs.currentUnitPos$.getValue();
    const booklet = this.tcs.booklet$.getValue();
    if ((currentUnitId >= 0) && (this.myUnitNumber === currentUnitId) && (booklet !== null)) {
      console.log('load Itemplayer - currentUnitId: ' + currentUnitId);
      const currentUnit = booklet.getUnitAt(currentUnitId);
      this.tcs.pageTitle$.next((currentUnitId + 1).toString() + '. ' + currentUnit.label);
      this.myUnitName = currentUnit.id;

      this.iFrameItemplayer = <HTMLIFrameElement>document.createElement('iframe');
      this.iFrameItemplayer.setAttribute('srcdoc', this.bs.getItemplayer(currentUnit.unitDefinitionType));
      this.iFrameItemplayer.setAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin');
      this.iFrameItemplayer.setAttribute('class', 'unitHost');
      const sideNavElement = document.getElementsByName('sideNav')[0];
      this.iFrameItemplayer.setAttribute('height', String(sideNavElement.clientHeight - 5));

      this.pendingUnitDefinition$.next(currentUnit.unitDefinition);
      const restorePoint = this.bs.getUnitRestorePoint(this.myUnitName);

      if ((restorePoint === null) || (restorePoint === undefined)) {
        this.pendingRestorePoint$.next(currentUnit.restorePoint);
      } else {
        this.pendingRestorePoint$.next(restorePoint);
      }
      // this.tss.pendingItemResources$.next(newUnit.getResourcesAsDictionary());
      // this.tss.pendingItemRestorePoint$.next(newUnit.restorePoint);

      this.iFrameHostElement.appendChild(this.iFrameItemplayer);    }
  }

  // %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
  ngOnDestroy() {
    if (this.routingSubscription !== null) {
      this.routingSubscription.unsubscribe();
    }
  }
}
