import { useState, useCallback } from 'react';

export function useToast(duration = 2500) {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);

  const show = useCallback((m: string) => {
    setMsg(m);
    setVisible(true);
    setTimeout(() => setVisible(false), duration);
  }, [duration]);

  return { msg, visible, show };
}
