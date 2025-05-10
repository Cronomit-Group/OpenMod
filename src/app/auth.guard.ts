import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

const { ipcRenderer } = window.require('electron');

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private router: Router, private http: HttpClient) {}

  canActivate(): Observable<boolean> {
    return this.isAuthenticated().pipe(
      map((authenticated) => {
        if (authenticated) {
          console.log('User authenticated');
          return true;
        } else {
          console.log('User not authenticated, opening login page...');
          this.login();
          return false;
        }
      }),
      catchError(() => {
        this.login();
        return of(false);
      })
    );
  }

  private isAuthenticated(): Observable<boolean> {
    return this.http.get<any>('http://localhost:3000/auth/status').pipe(
      map((response) => response.authenticated),
      catchError(() => of(false))
    );
  }

  private login(): void {
    console.log('Opening external link...');
    ipcRenderer.invoke('open-external-link', 'http://localhost:3000/auth/login');
  }
}
