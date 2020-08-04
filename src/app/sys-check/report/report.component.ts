import { BackendService } from '../backend.service';
import { SysCheckDataService } from '../sys-check-data.service';
import {Component, Input, OnDestroy} from '@angular/core';
import { SaveReportComponent } from './save-report/save-report.component';
import { ReportEntry } from '../sys-check.interfaces';
import { Subscription } from 'rxjs';
import {ServerError} from 'iqb-components';
import {MatDialog} from '@angular/material/dialog';
import {MatSnackBar} from '@angular/material/snack-bar';

@Component({
  selector: 'iqb-report',
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.css']
})
export class ReportComponent implements OnDestroy {

  @Input() canSave: boolean;

  environmentData: ReportEntry[] = [];
  networkData: ReportEntry[] = [];
  questionnaireData: ReportEntry[] = [];
  questionnaireDataWarnings: ReportEntry[] = [];
  unitData: ReportEntry[] = [];

  csvReport = '';

  private eDataSubscription: Subscription;
  private nDataSubscription: Subscription;
  private qDataSubscription: Subscription;
  private uDataSubscription: Subscription;

  constructor(
    private bs: BackendService,
    private ds: SysCheckDataService,
    private saveDialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.eDataSubscription = this.ds.environmentData$.subscribe(rd => {this.environmentData = rd; });
    this.nDataSubscription = this.ds.networkData$.subscribe(rd => {this.networkData = rd; });
    this.qDataSubscription = this.ds.questionnaireData$.subscribe(rd => {
      this.questionnaireData = rd;
      this.questionnaireDataWarnings = [];
      this.questionnaireData.forEach(re => {
        if (re.warning) {
          this.questionnaireDataWarnings.push(re);
        }
      });
    });
    this.uDataSubscription = this.ds.unitData$.subscribe(rd => this.unitData = rd);
  }

  saveReport() {

    const dialogRef = this.saveDialog.open(SaveReportComponent, {
      width: '500px',
      height: '600px'
    });
    dialogRef.afterClosed().subscribe(result => {
      if (typeof result !== 'undefined') {
        if (result !== false) {
          const reportKey = result.get('key').value as string;
          const reportTitle = result.get('title').value as string;
          const cd = this.ds.checkConfig$.getValue();
          console.log('result', result);
          this.bs.saveReport(
              cd.workspaceId,
              cd.name,
              {
                keyPhrase: reportKey,
                title: reportTitle,
                environment: this.ds.environmentData$.getValue(),
                network: this.ds.networkData$.getValue(),
                questionnaire: this.ds.questionnaireData$.getValue(),
                unit: this.ds.unitData$.getValue()
              }
          ).subscribe((saveReportResult: boolean|ServerError) => {
            if (saveReportResult instanceof ServerError) {
              this.snackBar.open('Konnte Bericht nicht speichern.', '', {duration: 3000});
            } else {
              this.snackBar.open('Bericht gespeichert.', '', {duration: 3000});
            }
          });
        }
      }
    });
  }

  exportReport() {

    const stripQuotes = (string: String) => (string.toString() || '').replace(/[\\"]/g, '\\"');

    this.csvReport = this.ds.environmentData$.getValue()
      .concat(this.ds.networkData$.getValue())
      .concat(this.ds.questionnaireData$.getValue())
      .concat(this.ds.unitData$.getValue())
      .map((e: ReportEntry) => '"' + stripQuotes(e.label) + '", "' + stripQuotes(e.value) + '"')
      .join('\n');
  }

  isReady() {
    return (typeof this.ds.task$.getValue() === 'undefined') && !this.ds.taskQueue.length;
  }

  ngOnDestroy() {
    if (this.eDataSubscription) {
      this.eDataSubscription.unsubscribe();
    }
    if (this.nDataSubscription) {
      this.nDataSubscription.unsubscribe();
    }
    if (this.qDataSubscription) {
      this.qDataSubscription.unsubscribe();
    }
    if (this.uDataSubscription) {
      this.uDataSubscription.unsubscribe();
    }
  }
}
