import {
  Component,
  EventEmitter,
  Input,
  Output,
  SecurityContext,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  Pipe,
  PipeTransform,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LoaderComponent } from '../../common/components/loader/loader.component';
//import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';
import { TranslateModule } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import {
  CardBodyComponent,
  CardComponent,
  CardFooterComponent,
  CardHeaderComponent,
  RowComponent,
  ColComponent,
  TableDirective,
  FormSelectDirective,
  FormModule,
  ButtonDirective,
  Tabs2Module,
} from '@coreui/angular';

@Pipe({
  name: 'safe',
  standalone: true
})

export class SafePipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(value);
  }
}
/**
 * FileViewerComponent
 *
 * A component that handles PDF file upload and viewing.
 * Supports single or multiple file uploads.
 * Can also handle base64 encoded PDF files for viewing existing documents.
 */
@Component({
  selector: 'file-viewer',
  standalone: true,
  imports: [
    CommonModule,
    CardBodyComponent,
    CardComponent,
    CardFooterComponent,
    CardHeaderComponent,
    RowComponent,
    ColComponent,
    LoaderComponent,
    TableDirective,
    FormSelectDirective,
    FormModule,
    ButtonDirective,
    SafePipe,
    TranslateModule,
    ToastModule
  ],
  templateUrl: './file-viewer.component.html',
  styleUrls: ['./file-viewer.component.scss'],
  providers: [MessageService]
})
export class FileViewerComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef;

  // Input properties for component configuration
  @Input() accept: string = 'application/pdf';  // Only PDF files
  @Input() multiple: boolean = false;          // Single file only
  @Input() maxFileSize: number = 10 * 1024 * 1024;  // Maximum file size (10MB default)
  @Input() showFileUploadControl: boolean = true;       // Whether to show the file upload control
  @Input() base64Files: Array<{ name: string; base64: string; type: string }> = [];  // Pre-loaded base64 files

  // Output events
  @Output() fileSelected = new EventEmitter<File[]>();  // Emits when files are selected
  @Output() fileRemoved = new EventEmitter<number>();   // Emits when a file is removed
  @Output() fileError = new EventEmitter<{ file: File; error: string }>();  // Emits when there's an error
  @Output() base64FilesChange = new EventEmitter<Array<{ name: string; base64: string; type: string }>>();  // Emits when base64Files changes

  // Internal state
  files: Array<{ name: string; base64: string; type: string; url: string }> = [];  // Array of files for preview
  isLoading: boolean = false;                      // Loading state indicator
  selectedFileIndex: number | null = null;         // Currently selected file for preview
  isDragging: boolean = false;                     // Drag and drop state

  constructor(
    private sanitizer: DomSanitizer,
    private messageService: MessageService
  ) {
    // Configure default toast options
    this.messageService.messageObserver.subscribe((message: any) => {
      if (message) {
        Object.assign(message, {
          sticky: false,
          life: 3000,
          closable: true
        });
      }
    });
  }

  /**
   * Initialize the component
   * Loads any base64 files if provided
   */
  ngOnInit() {
    if (!Array.isArray(this.base64Files)) {
      this.base64Files = [];
    }
    if (this.base64Files.length > 0) {
      this.loadBase64Files();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['base64Files'] && this.base64Files && this.base64Files.length > 0) {
      this.loadBase64Files();
    }
  }

  /**
   * Loads files from base64 encoded data
   * Converts base64 strings to safe URLs for viewing
   */
  private loadBase64Files(): void {
    if (!Array.isArray(this.base64Files)) {
      this.base64Files = [];
    }
    this.isLoading = true;
    try {
      this.files = [];
      this.base64Files.forEach(fileData => {
        if (!fileData.base64 || !fileData.name || !fileData.type) {
          console.warn('Invalid base64 file data:', fileData);
          return;
        }
        if (!this.isPdfFile(fileData.type)) {
          console.warn('Invalid file type for base64 file:', fileData.type);
          return;
        }
        try {
          // Create a data URL for viewing. This has better compatibility with older browsers.
          const url = `data:${fileData.type};base64,${fileData.base64}`;
          this.files.push({ ...fileData, url: url });
        } catch (error) {
          console.error('Error processing base64 file:', error);
        }
      });
    } catch (error) {
      console.error('Error loading base64 files:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Handles file selection from the input element
   * Converts files to base64 and adds to base64Files
   */
  async onFileSelected(event: Event): Promise<void> {
    if (!Array.isArray(this.base64Files)) {
      this.base64Files = [];
    }

    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    this.isLoading = true;
    const selectedFiles = Array.from(input.files);
    const validFiles: File[] = [];

    try {
      // Only keep the last uploaded file (replace existing)
      this.base64Files = [];

      for (const file of selectedFiles) {
        if (file.size > this.maxFileSize) {
          const errorMsg = `File size exceeds ${this.formatFileSize(this.maxFileSize)}`;
          this.fileError.emit({ file, error: errorMsg });
          this.messageService.add({
            severity: 'error',
            summary: 'File Too Large',
            detail: errorMsg
          });
          continue;
        }

        if (!this.isPdfFile(file.type)) {
          const errorMsg = 'Only PDF files are allowed';
          this.fileError.emit({ file, error: errorMsg });
          this.messageService.add({
            severity: 'error',
            summary: 'Invalid File Type',
            detail: 'Please select a PDF file only'
          });
          continue;
        }

        const rawBase64 = await this.fileToBase64(file);

        if (!rawBase64.startsWith('data:application/pdf;base64,')) {
          throw new Error('Invalid base64 string');
        }

        const cleanedBase64 = rawBase64.replace(/^data:application\/pdf;base64,/, '');
        this.base64Files.push({
          name: file.name,
          base64: cleanedBase64,
          type: 'application/pdf'
        });

        validFiles.push(file);
        break; // Only allow one file
      }

      if (validFiles.length > 0) {
        this.loadBase64Files(); // Optional: trigger custom logic
        this.fileSelected.emit(validFiles);
        this.base64FilesChange.emit(this.base64Files);
      }

    } catch (error) {
      console.error('Error processing files:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Processing Error',
        detail: 'Error processing selected file'
      });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Removes a file from the list and cleans up its URL
   * Emits the index of the removed file
   */
  removeFile(index: number): void {
    if (index < 0 || index >= this.files.length) {
      console.warn('Invalid file index:', index);
      return;
    }
    try {
      const removed = this.files.splice(index, 1);
      this.base64Files.splice(index, 1);
      if (removed.length > 0) {
        URL.revokeObjectURL(removed[0].url);  // Clean up the object URL
        this.fileRemoved.emit(index);
        this.base64FilesChange.emit(this.base64Files);
        if (this.selectedFileIndex === index) {
          this.selectedFileIndex = null;
        } else if (this.selectedFileIndex !== null && this.selectedFileIndex > index) {
          this.selectedFileIndex--;
        }
      }
    } catch (error) {
      console.error('Error removing file:', error);
    }
  }

  /**
   * Previews a file if it's a supported type
   */
  previewFile(index: number): void {
    if (index < 0 || index >= this.files.length) {
      console.warn('Invalid file index for preview:', index);
      return;
    }

    this.selectedFileIndex = index;
  }

  /**
   * Closes the file preview
   */
  closePreview(): void {
    this.selectedFileIndex = null;
  }

  /**
   * Checks if a file type is allowed based on the accept input
   */
  private isFileTypeAllowed(fileType: string): boolean {
    if (!fileType) return false;

    const allowedTypes = 'application/pdf';
    return allowedTypes === fileType;
  }

  /**
   * Checks if a file type is previewable
   */
  isPreviewable(fileType: string): boolean {
    return this.isPdfFile(fileType);
  }

  /**
   * Checks if a file is a PDF
   */
  isPdfFile(fileType: string): boolean {
    return fileType === 'application/pdf';
  }

  /**
   * Formats file size to human-readable format
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Cleanup method to prevent memory leaks
   * Revokes all object URLs when the component is destroyed
   */
  ngOnDestroy(): void {
    try {
      this.files.forEach(file => {
        if (file.url) {
          URL.revokeObjectURL(file.url);
        }
      });
    } catch (error) {
      console.error('Error cleaning up file URLs:', error);
    }
  }

  /**
   * Handles the dragover event
   * Prevents default behavior and sets dragging state
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  /**
   * Handles the dragleave event
   * Prevents default behavior and resets dragging state
   */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  /**
   * Handles the drop event
   * Processes dropped files and resets dragging state
   */
  async onDrop(event: DragEvent): Promise<void> {
    if (!Array.isArray(this.base64Files)) {
      this.base64Files = [];
    }
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    if (!event.dataTransfer?.files) {
      return;
    }
    const files = Array.from(event.dataTransfer.files);
    const validFiles: File[] = [];
    // Only keep the last dropped file (replace existing)
    this.base64Files = [];
    for (const file of files) {
      if (file.size > this.maxFileSize) {
        const errorMsg = `File size exceeds ${this.formatFileSize(this.maxFileSize)}`;
        this.fileError.emit({ file, error: errorMsg });
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMsg
        });
        continue;
      }
      if (!this.isPdfFile(file.type)) {
        const errorMsg = 'Only PDF files are allowed';
        this.fileError.emit({ file, error: errorMsg });
        this.messageService.add({
          severity: 'error',
          summary: 'Invalid File Type',
          detail: 'Please select a PDF file only'
        });
        continue;
      }
      const base64 = await this.fileToBase64(file);

      const cleanedBase64 = base64.replace(/^data:application\/pdf;base64,/, '');
      this.base64Files.push({ name: file.name, base64: cleanedBase64, type: file.type });
      validFiles.push(file);
      // Only allow one file
      break;
    }
    if (validFiles.length > 0) {
      this.loadBase64Files();
      this.fileSelected.emit(validFiles);
      this.base64FilesChange.emit(this.base64Files);
      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: 'PDF file uploaded successfully'
      });
    }
  }

  /**
   * Converts a File to a base64 string
   */
  private async fileToBase64(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result); // ✅ Return full string with data:application/pdf;base64,...
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }

  sanitizedPdf(file: any): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(`data:application/pdf;base64,${file.base64}`);
  }



  sanitizedPdfBlob(file: any): SafeResourceUrl {
  const byteCharacters = atob(file.base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  return this.sanitizer.bypassSecurityTrustResourceUrl(url);
}


}
