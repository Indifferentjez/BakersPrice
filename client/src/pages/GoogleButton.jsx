import { useEffect, useRef } from 'react';

let gisPromise;

function loadGis() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load Google sign-in'));
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

export default function GoogleButton({ clientId, onCredential, disabled }) {
  const slot = useRef(null);

  useEffect(() => {
    if (!clientId || disabled) return undefined;
    let cancelled = false;
    loadGis().then(() => {
      if (cancelled || !slot.current || !window.google?.accounts?.id) return;
      slot.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (res) => { if (res?.credential) onCredential(res.credential); },
      });
      // GIS needs a pixel width (valid range ~200–400). Fit it to the slot so
      // it never overflows a narrow auth card on a phone.
      const avail = slot.current.offsetWidth || 320;
      window.google.accounts.id.renderButton(slot.current, {
        theme: 'outline',
        size: 'large',
        width: Math.max(200, Math.min(400, Math.round(avail))),
        text: 'continue_with',
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [clientId, onCredential, disabled]);

  if (!clientId) return null;
  return <div className="google-btn" ref={slot} />;
}
