import Card from '../components/card';
import Alert from '../components/alert';

const sections = [
  {
    id: 'section-1',
    title: 'Introduction',
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.'
  },
  {
    id: 'section-2',
    title: 'Getting Started',
    content: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt.'
  },
  {
    id: 'section-3',
    title: 'Configuration',
    content: 'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto.'
  },
  {
    id: 'section-4',
    title: 'Advanced Usage',
    content: 'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt neque porro quisquam.'
  },
  {
    id: 'section-5',
    title: 'Best Practices',
    content: 'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati.'
  },
  {
    id: 'section-6',
    title: 'Troubleshooting',
    content: 'Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est omnis dolor repellendus.'
  },
  {
    id: 'section-7',
    title: 'Performance Tips',
    content: 'Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae itaque earum rerum hic tenetur.'
  },
  {
    id: 'section-8',
    title: 'Security Considerations',
    content: 'Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus.'
  },
  {
    id: 'section-9',
    title: 'API Reference',
    content: 'Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur at vero eos et accusamus.'
  },
  {
    id: 'section-10',
    title: 'Conclusion',
    content: 'Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat. Thank you for reading!'
  }
];

<template>
  <div class="page-long" data-test-page="long-page">
    <header class="page-header">
      <h1 class="page-title">Long Scrollable Page</h1>
      <p class="page-subtitle">Used to test fullPage screenshot option</p>
    </header>

    <Alert @variant="info" @testId="scroll-notice">
      This page has content that extends beyond the viewport to test full-page screenshots.
    </Alert>

    {{#each sections as |section index|}}
      <Card @title={{section.title}} @testId={{section.id}} class="section-card">
        <p>{{section.content}}</p>
        <p class="section-number">Section {{index}} of 10</p>
      </Card>
    {{/each}}

    <footer class="page-footer" data-test-footer>
      <p>You've reached the bottom of the page!</p>
    </footer>
  </div>

  <style>
    .page-long {
      max-width: 800px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-title {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 700;
      color: #111827;
    }

    .page-subtitle {
      margin: 0;
      font-size: 16px;
      color: #6b7280;
    }

    .section-card {
      margin-top: 24px;
    }

    .section-number {
      margin: 16px 0 0 0;
      font-size: 13px;
      color: #9ca3af;
    }

    .page-footer {
      margin-top: 40px;
      padding: 40px;
      text-align: center;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      border-radius: 12px;
      color: white;
    }

    .page-footer p {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
  </style>
</template>
