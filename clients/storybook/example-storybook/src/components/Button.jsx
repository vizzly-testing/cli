import React from 'react';

export function Button({ label, variant = 'primary', onClick }) {
  let styles = {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
  };

  if (variant === 'primary') {
    styles.backgroundColor = '#007bff';
    styles.color = 'white';
  } else if (variant === 'secondary') {
    styles.backgroundColor = '#6c757d';
    styles.color = 'white';
  } else if (variant === 'danger') {
    styles.backgroundColor = '#dc3545';
    styles.color = 'white';
  }

  return (
    <button style={styles} onClick={onClick}>
      {label}
    </button>
  );
}
