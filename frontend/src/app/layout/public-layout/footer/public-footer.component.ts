import { Component } from '@angular/core';

@Component({
  selector: 'app-public-footer',
  imports: [],
  templateUrl: './public-footer.component.html',
  styleUrl: './public-footer.component.scss',
})
export class PublicFooterComponent {
  protected readonly currentYear = new Date().getFullYear();
}
