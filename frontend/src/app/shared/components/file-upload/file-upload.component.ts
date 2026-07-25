import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ICON_NAMES } from '../../icon-names';

/**
 * Domain-agnostic (blueprint §11) - wraps drag-drop + click-to-browse +
 * a client-side MIME/size pre-check mirroring whatever real backend
 * allow-list the caller passes in. Purely presentational: no
 * HttpClient/Store injection, just input()/output(). Reused by both
 * Account's profile picture (this feature) and, later, Employee
 * documents - the reason this was built as a real shared component
 * rather than one-off markup (unlike EmptyStateComponent, deliberately
 * still deferred - see blueprint §4.3/revision v6).
 */
@Component({
  selector: 'app-file-upload',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './file-upload.component.html',
  styleUrl: './file-upload.component.scss',
})
export class FileUploadComponent {
  readonly accept = input.required<string[]>();
  readonly maxSizeBytes = input.required<number>();
  readonly label = input('Upload a file');
  readonly icon = input<string>(ICON_NAMES.photoCamera);

  readonly fileSelected = output<File>();
  readonly rejected = output<string>();

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected browse(): void {
    this.fileInput().nativeElement.click();
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.handleFile(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  protected onFileInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      this.handleFile(file);
    }
    // Reset so selecting the exact same file again still fires 'change'.
    target.value = '';
  }

  private handleFile(file: File): void {
    if (!this.accept().includes(file.type)) {
      this.rejected.emit(`"${file.name}" is not an accepted file type.`);
      return;
    }

    if (file.size > this.maxSizeBytes()) {
      const maxMb = Math.round(this.maxSizeBytes() / (1024 * 1024));
      this.rejected.emit(`"${file.name}" is too large (max ${maxMb} MB).`);
      return;
    }

    this.fileSelected.emit(file);
  }
}
