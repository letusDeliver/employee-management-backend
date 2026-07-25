import { Component, DestroyRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class App {
  constructor() {
    // Chrome (and other browsers) can restore an entire prior page - JS
    // heap included - from the back/forward cache instead of running a
    // normal Angular navigation, bypassing every guard and leaving stale
    // session state on screen (e.g. an already-logged-in visitor briefly
    // shown a frozen pre-login `/login` page after pressing Back). A full
    // reload forces a genuine fresh bootstrap, which re-runs the real
    // guards against current reality.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('pageshow', handlePageShow));
  }
}
