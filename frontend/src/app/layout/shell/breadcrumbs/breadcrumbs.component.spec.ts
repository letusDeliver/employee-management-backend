import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { BreadcrumbsComponent } from './breadcrumbs.component';

@Component({ template: '' })
class BlankComponent {}

// Mirrors the real shape in app.routes.ts / employees.routes.ts: a parent route that
// owns the single "Employees" crumb, whose empty-path list child deliberately sets no
// breadcrumb of its own. Angular's default `paramsInheritanceStrategy: 'emptyOnly'`
// makes an empty-path child INHERIT its parent's `data`, so reading the inherited
// `snapshot.data` used to show "Employees > Employees" on the list page.
const routes: Routes = [
  {
    path: 'employees',
    data: { breadcrumb: 'Employees' },
    children: [
      { path: '', component: BlankComponent, data: { permissions: ['employee:read:any'] } },
      { path: 'new', component: BlankComponent, data: { breadcrumb: 'New Employee' } },
      { path: ':id', component: BlankComponent, data: { breadcrumb: 'Employee' } },
    ],
  },
  { path: 'branches', component: BlankComponent, data: { breadcrumb: 'Branches' } },
  { path: 'no-crumb', component: BlankComponent },
];

describe('BreadcrumbsComponent', () => {
  let harness: RouterTestingHarness;

  const render = async (url: string): Promise<{ fixture: ComponentFixture<BreadcrumbsComponent>; labels: string[] }> => {
    await harness.navigateByUrl(url);
    const fixture = TestBed.createComponent(BreadcrumbsComponent);
    fixture.detectChanges();
    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('li.crumb')].map((li) =>
      (li.textContent ?? '').replace('›', '').replace(/\s+/g, ' ').trim(),
    );
    return { fixture, labels };
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    harness = await RouterTestingHarness.create();
  });

  it('shows ONE "Employees" crumb on the list page - the empty-path child does not repeat its parent', async () => {
    const { labels } = await render('/employees');

    expect(labels).toEqual(['Employees']);
  });

  it('shows the parent crumb then the child crumb on a nested page', async () => {
    const { labels } = await render('/employees/new');

    expect(labels).toEqual(['Employees', 'New Employee']);
  });

  it('shows the dynamic-param child under the parent', async () => {
    const { labels } = await render('/employees/abc-123');

    expect(labels).toEqual(['Employees', 'Employee']);
  });

  it('links every crumb except the last, and marks the last as the current page', async () => {
    const { fixture } = await render('/employees/new');
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('li.crumb a')).toHaveLength(1);
    expect(el.querySelector('li.crumb a')?.getAttribute('href')).toBe('/employees');
    expect(el.querySelector('[aria-current="page"]')?.textContent).toContain('New Employee');
  });

  it('still shows a flat route\'s own crumb', async () => {
    const { labels } = await render('/branches');

    expect(labels).toEqual(['Branches']);
  });

  it('omits a route that sets no breadcrumb at all', async () => {
    const { labels } = await render('/no-crumb');

    expect(labels).toEqual([]);
  });
});
