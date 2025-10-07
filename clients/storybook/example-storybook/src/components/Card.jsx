import React from 'react';

export function Card({ title, content }) {
  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '20px',
        maxWidth: '400px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      <h2 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>{title}</h2>
      <p style={{ margin: 0, color: '#666' }}>{content}</p>
    </div>
  );
}
