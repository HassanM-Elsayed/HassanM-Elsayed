import { Component, EventEmitter, Input, OnInit, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  CardBodyComponent,
  CardComponent,
  CardHeaderComponent,
  ColComponent,
  RowComponent,
  ButtonDirective,
  FormModule,
  FormControlDirective,
  FormLabelDirective,
  BadgeComponent
} from '@coreui/angular';
import { FormGroup, FormsModule } from '@angular/forms';
import { NgSelectComponent } from '../../ngselect/ngselect.component';
import { OutgoingMetadataService } from '../../../services/outgoing/metadata.service';
import { HttpClient } from '@angular/common/http';
import { Store, select } from '@ngrx/store';
import { UserState } from '../../../store/user/reducer';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
  selector: 'correlated-correspondence',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    CardComponent,
    CardHeaderComponent,
    CardBodyComponent,
    RowComponent,
    ColComponent,
    ButtonDirective,
    FormModule,
    FormsModule,
    NgSelectComponent,
    FormControlDirective,
    FormLabelDirective,
    BadgeComponent,
    FontAwesomeModule
  ],
  templateUrl: './correlated-correspondence.component.html',
  styleUrls: ['./correlated-correspondence.component.scss']
})
export class CorrelatedCorrespondenceComponent implements OnInit, OnChanges {
  @Input() fetchItems!: (searchTerm: string) => Promise<any[]>;
  @Input() selectedItemsToPopulateFromParent: any[] = [];
  @Input() selectedItemsToPopulate: any[] = [];
  @Input() disabled: boolean = false;

  @Output() selectionChange = new EventEmitter<any[]>();

  filterBtn = false;
  selectedItems: any[] = [];
  faTrash = faTrash;

  // Modal and selection state
  showModal = false;
  modalResults: any[] = [];
  modalSelected: Set<string> = new Set();

  // Filter form data
  filterForm = {
    subjectReference: '',
    fromDate: '',
    toDate: '',
    searchArchive: false
  };

  // Placeholder: Replace with actual employee_id source (e.g., from user state or input)
  employeeId: number | undefined;
  correlationId: number = 0; // Default to 0
  user$: any;
  user: any = {};

  constructor(
    private outgoingMetadataService: OutgoingMetadataService,
    private http: HttpClient,
    private store: Store<{ user: UserState }>,
    public translate: TranslateService
  ) {
    this.user$ = this.store.pipe(select((state: { user: UserState }) => state.user.user));
    this.user$.subscribe((user: any) => {
      this.user = user;
      this.employeeId = this.user?.user?.employeeId || this.user?.employeeId;
    });
  }

  ngOnInit(): void {
    this.processSelectedItemsFromParent();
    this.employeeId = this.user?.user?.employeeId || this.user?.employeeId;
    // Default dates: from = 2 weeks before, to = today
    const today = new Date();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(today.getDate() - 14);
    this.filterForm.fromDate = this.formatDate(twoWeeksAgo);
    this.filterForm.toDate = this.formatDate(today);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedItemsToPopulateFromParent'] && changes['selectedItemsToPopulateFromParent'].currentValue) {
      this.processSelectedItemsFromParent();
    }
  }

  private processSelectedItemsFromParent(): void {
    if (this.selectedItemsToPopulateFromParent?.length > 0) {
      this.selectedItems = this.selectedItemsToPopulateFromParent.map(item => ({
        ...item,
        show_in_pdf: item.show_in_pdf ?? false
      }));
      this.selectionChange.emit(this.selectedItems);
    }
  }

  toggleFilter(): void {
    this.filterBtn = !this.filterBtn;
  }

  onSelectionChange(newSelections: any[]): void {
    // Deduplicate by correspondenceId, referenceNo, or id, skip items with undefined key
    const uniqueMap = new Map<string, any>();
    for (const item of newSelections) {
      const key = item.correspondenceId || item.referenceNo || item.id;
      if (key !== undefined && key !== null && !uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    }
    this.selectedItems = Array.from(uniqueMap.values());
    this.selectionChange.emit(this.selectedItems);
  }

  deleteItem(itemId: string): void {
    this.selectedItems = this.selectedItems.filter(item => item.id !== itemId);
    this.selectionChange.emit(this.selectedItems);
  }

  clearAllItems(): void {
    this.selectedItems = [];
    this.selectionChange.emit(this.selectedItems);
  }

  applyFilters(): void {
    if (!this.employeeId) {
      alert(this.translate.instant('OUTGOING_PAGE.DISTRIBUTION.ALERTS.USER_NOT_LOADED'));
      return;
    }
    if (!this.filterForm.fromDate || !this.filterForm.toDate) {
      alert(this.translate.instant('OUTGOING_PAGE.DISTRIBUTION.ALERTS.REQUIRED_DATES'));
      return;
    }
    const correlationId = 0; // Always send 0 as correlationId
    const employeeId = this.employeeId;
    const from = this.filterForm.fromDate;
    const to = this.filterForm.toDate;
    const reference = this.filterForm.subjectReference ? this.filterForm.subjectReference : undefined;
    const archived = this.filterForm.searchArchive;

    this.outgoingMetadataService
      .searchSignedCorrespondenceQuickWithDate(correlationId, employeeId, from, to, reference, archived)
      .subscribe({
        next: (result) => {
          this.modalResults = Array.isArray(result) ? result : [];
          this.modalSelected.clear();
          if (this.modalResults.length > 0) {
            this.showModal = true;
          } else {
            alert(this.translate.instant('OUTGOING_PAGE.DISTRIBUTION.ALERTS.NO_RESULTS'));
          }
        },
        error: (err) => {
          alert(this.translate.instant('OUTGOING_PAGE.DISTRIBUTION.ALERTS.FAILED_FETCH'));
        }
      });
  }

  closeModal(): void {
    this.showModal = false;
  }

  toggleModalSelection(item: any): void {
    const id = item.correspondenceId || item.referenceNo || item.id || item.name;
    if (this.modalSelected.has(id)) {
      this.modalSelected.delete(id);
    } else {
      this.modalSelected.add(id);
    }
  }

  addSelectedToMainTable(): void {
    const selectedRows = this.modalResults.filter(item => {
      const id = item.correspondenceId || item.referenceNo || item.id || item.name;
      return this.modalSelected.has(id);
    });
    // Merge with existing selectedItems, avoiding duplicates
    const allSelections = [...this.selectedItems, ...selectedRows];
    const uniqueMap = new Map<string, any>();
    for (const item of allSelections) {
      const key = item.correspondenceId || item.referenceNo || item.id || item.name;
      uniqueMap.set(key, item);
    }
    this.selectedItems = Array.from(uniqueMap.values()).map(item => ({
      id: item.correspondenceId || item.referenceNo || item.name,
      displayName: item.name || item.displayName || item.referenceNo || '',
      subject: item.subject || item.item_text || item.company || '',
      modifiedDate: item.modifiedDate || item.createdDate || '',
      createdByName: item.createdByName || item.senderName || '',
      show_in_pdf: item.show_in_pdf ?? false
    }));
    this.selectionChange.emit(this.selectedItems);
    this.closeModal();
  }

  clearFilters(): void {
    const today = new Date();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(today.getDate() - 14);
    this.filterForm = {
      subjectReference: '',
      fromDate: this.formatDate(twoWeeksAgo),
      toDate: this.formatDate(today),
      searchArchive: false
    };
  }

  displayField(item: any, field: string): string {
    return item?.[field] ?? 'N/A';
  }

  getItemCount(): number {
    return this.selectedItems.length;
  }

  trackByItemId(index: number, item: any): string {
    return item.id || item.referenceNo || item.name || index.toString();
  }

  // Add this method to check if a modal row is selected
  isModalRowSelected(item: any): boolean {
    const id = item.correspondenceId || item.referenceNo || item.id || item.name;
    return this.modalSelected.has(id);
  }

  // Add this method to handle row click
  onModalRowClick(item: any): void {
    this.toggleModalSelection(item);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
