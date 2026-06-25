import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useGoToChat() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return useCallback(() => {
    if (pathname !== '/') {
      navigate('/');
    }
  }, [navigate, pathname]);
}
