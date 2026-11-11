import { useAuthContext } from '../contexts/AuthContext';
import { AuthContextType } from '../types/auth';

export const useAuth = (): AuthContextType => {
  return useAuthContext();
};
