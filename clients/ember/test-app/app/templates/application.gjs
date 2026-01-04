import { pageTitle } from 'ember-page-title';
import NavBar from '../components/nav-bar';
import Button from '../components/button';

<template>
  {{pageTitle "Vizzly Demo App"}}

  <div class="app-layout">
    <NavBar>
      <Button @variant="primary" @size="small" @testId="login">
        Sign In
      </Button>
    </NavBar>

    <main class="app-main">
      {{outlet}}
    </main>
  </div>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f3f4f6;
      color: #111827;
      line-height: 1.5;
    }

    .app-layout {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .app-main {
      flex: 1;
      padding: 24px;
    }
  </style>
</template>
