/** 已在聊天页则 no-op，否则 navigate('/') */
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** 跳转到聊天首页 */
export function useGoToChat() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return useCallback(() => {
    if (pathname !== '/') {
      navigate('/');
    }
  }, [navigate, pathname]);
}
