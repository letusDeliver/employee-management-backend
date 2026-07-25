import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

interface Breadcrumb {
  label: string;
  url: string;
}

/**
 * Generic - derives crumbs from whatever routes set `data.breadcrumb`
 * (blueprint §3), not hand-maintained per page. A route that forgets to
 * set it simply omits itself from the trail.
 */
@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink],
  templateUrl: './breadcrumbs.component.html',
  styleUrl: './breadcrumbs.component.scss',
})
export class BreadcrumbsComponent {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);

  protected readonly breadcrumbs = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.buildBreadcrumbs()),
    ),
    { initialValue: this.buildBreadcrumbs() },
  );

  private buildBreadcrumbs(): Breadcrumb[] {
    const crumbs: Breadcrumb[] = [];
    let route: ActivatedRoute | null = this.activatedRoute.root;
    let url = '';

    while (route) {
      const child: ActivatedRoute | null = route.firstChild;

      // `child` can exist as a tree node before the router has attached its
      // snapshot (e.g. this component constructs synchronously as part of
      // ShellComponent's own template, ahead of the deeper `dashboard`
      // child route's activation) - guard on the snapshot itself, not just
      // the node's existence.
      if (!child?.snapshot) {
        break;
      }

      const routePath = child.snapshot.url.map((segment) => segment.path).join('/');

      if (routePath) {
        url += `/${routePath}`;
      }

      const label = child.snapshot.data['breadcrumb'] as string | undefined;

      if (label) {
        crumbs.push({ label, url });
      }

      route = child;
    }

    return crumbs;
  }
}
