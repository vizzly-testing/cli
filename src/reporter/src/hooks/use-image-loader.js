import { useState, useEffect } from 'react';

export default function useImageLoader(src) {
  let [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!src) {
      setStatus('missing');
      return;
    }

    setStatus('loading');
    let img = new Image();
    img.onload = () => setStatus('loaded');
    img.onerror = () => setStatus('error');
    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return status;
}
