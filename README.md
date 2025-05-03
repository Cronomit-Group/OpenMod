# Details

This is a test project to integrate a fresh Angular application with Electron, and use a Node Express server as a local backend. Electron will target the `index.html` file that exists in the dist folder after running `ng build` and bootstraps that as the application. At the same time in the same `createWindow` method, we launch the Express backend and set it to listen at port 3000. These are all of the modifications that I performed.

# AngularElectron

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 14.1.0.

## Development server

Run `npm run electron-build` to start the application and the Express server.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Build x64

I have added ElectronForge to this project to demonstrate building an x64 application. Run `npm run package` and then `npm run make` and the application will be zipped and put in the `/out` folder.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
