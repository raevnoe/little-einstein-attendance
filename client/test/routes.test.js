import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { homeSection, parsePath, resolveRoute, sectionPath } from '../src/lib/routes.js';

describe('page addresses', () => {
  it('builds the address of each section', () => {
    assert.equal(sectionPath('admin', 'dashboard'), '/admin-dashboard');
    assert.equal(sectionPath('admin', 'rfid'), '/admin-dashboard/rfid-cards');
    assert.equal(sectionPath('admin', 'audit'), '/admin-dashboard/audit-log');
    assert.equal(sectionPath('teacher', 'reports'), '/teacher-dashboard/reports');
    assert.equal(sectionPath('parent', 'records'), '/parent-dashboard');
    assert.equal(sectionPath('parent', 'dismissal'), '/parent-dashboard/fetchers');
    // Sections a role does not have fall back to its home.
    assert.equal(sectionPath('teacher', 'accounts'), '/teacher-dashboard');
    assert.equal(homeSection('parent'), 'records');
    assert.equal(homeSection('teacher'), 'dashboard');
  });

  it('reads addresses (case and trailing slash do not matter)', () => {
    assert.deepEqual(parsePath('/'), { page: 'landing' });
    assert.deepEqual(parsePath('/login/'), { page: 'login' });
    assert.deepEqual(parsePath('/Teacher-Dashboard/Reports/'), { page: 'dashboard', role: 'teacher', section: 'reports' });
    assert.deepEqual(parsePath('/parent-dashboard/fetchers'), { page: 'dashboard', role: 'parent', section: 'dismissal' });
    assert.deepEqual(parsePath('/teacher-dashboard/accounts'), { page: 'dashboard', role: 'teacher', section: null });
    assert.deepEqual(parsePath('/admin-dashboardx'), { page: 'unknown' });
    assert.deepEqual(parsePath('/students/K2026-001'), { page: 'unknown' });
  });

  it('signed in: always the OWN dashboard, never another role’s', () => {
    const teacher = (pathname, returnTo) => resolveRoute({ signedIn: true, role: 'teacher', pathname, returnTo });
    assert.deepEqual(teacher('/teacher-dashboard/reports'), { page: 'dashboard', section: 'reports', path: '/teacher-dashboard/reports' });
    assert.deepEqual(teacher('/admin-dashboard/accounts'), { page: 'dashboard', section: 'dashboard', path: '/teacher-dashboard' });
    assert.deepEqual(teacher('/parent-dashboard'), { page: 'dashboard', section: 'dashboard', path: '/teacher-dashboard' });
    assert.equal(teacher('/teacher-dashboard/accounts').path, '/teacher-dashboard');
    assert.equal(teacher('/').path, '/teacher-dashboard');
    assert.equal(teacher('/login').path, '/teacher-dashboard');
    assert.equal(teacher('/nowhere').path, '/teacher-dashboard');
  });

  it('signed in from the login form: back to the address opened before, if it is their own', () => {
    assert.equal(resolveRoute({ signedIn: true, role: 'teacher', pathname: '/login', returnTo: '/teacher-dashboard/attendance' }).path,
      '/teacher-dashboard/attendance');
    assert.equal(resolveRoute({ signedIn: true, role: 'parent', pathname: '/login', returnTo: '/admin-dashboard/accounts' }).path,
      '/parent-dashboard');
  });

  it('signed out: dashboards show the login form, anything else the landing page', () => {
    const out = (pathname) => resolveRoute({ signedIn: false, pathname });
    assert.deepEqual(out('/'), { page: 'landing', path: '/' });
    assert.deepEqual(out('/login'), { page: 'login', path: '/login' });
    assert.deepEqual(out('/admin-dashboard/audit-log'), { page: 'login', path: '/login' });
    assert.deepEqual(out('/somewhere'), { page: 'landing', path: '/' });
  });
});
