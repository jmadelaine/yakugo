import { createContext, useContext } from 'react'
import type { User } from '@shared/types'

export const UserContext = createContext<User | undefined>(undefined)

export function useUser(): User {
  const user = useContext(UserContext)
  if (!user) throw new Error('useUser must be used inside AuthGate')
  return user
}
