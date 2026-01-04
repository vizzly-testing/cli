import Component from '@glimmer/component';
import { LinkTo } from '@ember/routing';

export default class NavBar extends Component {
  <template>
    <nav class="nav-bar" data-test-nav-bar>
      <div class="nav-brand">
        <a href="/" class="brand-link">
          <span class="brand-icon">V</span>
          <span class="brand-name">Vizzly Demo</span>
        </a>
      </div>

      <div class="nav-links">
        <LinkTo @route="index" class="nav-link">Home</LinkTo>
        <LinkTo @route="forms" class="nav-link">Forms</LinkTo>
        <LinkTo @route="components" class="nav-link">Components</LinkTo>
      </div>

      <div class="nav-actions">
        {{yield}}
      </div>
    </nav>

    <style>
      .nav-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
        height: 64px;
        background: white;
        border-bottom: 1px solid #e5e7eb;
      }

      .nav-brand {
        display: flex;
        align-items: center;
      }

      .brand-link {
        display: flex;
        align-items: center;
        gap: 10px;
        text-decoration: none;
        color: inherit;
      }

      .brand-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
        color: white;
        font-weight: 700;
        font-size: 16px;
        border-radius: 8px;
      }

      .brand-name {
        font-weight: 600;
        font-size: 18px;
        color: #111827;
      }

      .nav-links {
        display: flex;
        gap: 8px;
      }

      .nav-link {
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        color: #6b7280;
        text-decoration: none;
        border-radius: 6px;
        transition: color 0.15s ease, background 0.15s ease;
      }

      .nav-link:hover {
        color: #111827;
        background: #f3f4f6;
      }

      .nav-link.active {
        color: #3b82f6;
        background: #eff6ff;
      }

      .nav-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }
    </style>
  </template>
}
