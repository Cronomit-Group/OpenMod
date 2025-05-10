// Angular import
import {Component, OnInit} from '@angular/core';
import { RouterModule } from '@angular/router';

// third party import
import { SharedModule } from 'src/app/theme/shared/shared.module';
import {UserService} from "../../../../../../services/user.service";

@Component({
  selector: 'app-nav-right',
  imports: [RouterModule, SharedModule],
  templateUrl: './nav-right.component.html',
  styleUrls: ['./nav-right.component.scss']
})
export class NavRightComponent implements OnInit {
  user:any
  constructor(private userService: UserService) {
  }
  ngOnInit() {
    this.userService.getUserData().subscribe({
      next: (data) => {
        console.log('User Data:', data);
        this.user = data;
      },
      error: (err) => {
        console.error('Failed to fetch user data:', err);
      }
    });
  }
}
