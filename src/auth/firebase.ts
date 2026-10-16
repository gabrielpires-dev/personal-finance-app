import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut, type Auth } from 'firebase/auth'
import { doc, getDoc, getFirestore, setDoc, type Firestore } from 'firebase/firestore'
import firebaseConfig from '@/data/firebase.json'

const IDLE_MS = 30 * 24 * 60 * 60 * 1000
const seenKey = 'pf.seen'
const lockKey = 'pf.lock'
const unlockMark = 'pf.unlock.1'

if (typeof localStorage !== 'undefined' && localStorage.getItem(unlockMark) !== '1') {
  localStorage.removeItem(lockKey)
  localStorage.setItem(unlockMark, '1')
}
const accountEmail = '12213457611@users.personal-finance.app'
const lockMessage = 'Acesso bloqueado após 3 tentativas de senha.'

export function usesFirebase() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)
}

const app = usesFirebase() ? initializeApp(firebaseConfig) : null
export const firebaseAuth: Auth | null = app ? getAuth(app) : null
export const firestore: Firestore | null = app ? getFirestore(app) : null

if (firebaseAuth) void setPersistence(firebaseAuth, browserLocalPersistence)

export function watchSession(onChange: (signedIn: boolean) => void) {
  if (!firebaseAuth) {
    onChange(false)
    return () => undefined
  }
  return onAuthStateChanged(firebaseAuth, (user) => {
    if (!user || user.email !== accountEmail) {
      onChange(false)
      return
    }
    const seen = Number(localStorage.getItem(seenKey) || '0')
    if (seen && Date.now() - seen > IDLE_MS) {
      localStorage.removeItem(seenKey)
      void signOut(firebaseAuth)
      onChange(false)
      return
    }
    localStorage.setItem(seenKey, String(Date.now()))
    onChange(true)
  })
}

export async function loginWithFirebase(username: string, password: string) {
  if (!firebaseAuth) throw new Error('O Firestore ainda não está configurado.')
  const lock = readLock()
  if (lock.locked) throw new Error(lockMessage)
  if (username.trim() !== '12213457611') {
    rememberFailure(lock.count)
    throw new Error(lock.count + 1 >= 3 ? lockMessage : 'Usuário ou senha inválidos.')
  }
  try {
    await signInWithEmailAndPassword(firebaseAuth, accountEmail, password)
    localStorage.setItem(lockKey, JSON.stringify({ count: 0, locked: false }))
    localStorage.setItem(seenKey, String(Date.now()))
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
      rememberFailure(lock.count)
      throw new Error(lock.count + 1 >= 3 ? lockMessage : 'Usuário ou senha inválidos.')
    }
    if (code === 'auth/too-many-requests') throw new Error(lockMessage)
    throw new Error('Não foi possível entrar.')
  }
}

export async function readFinanceDocument() {
  if (!firestore) return null
  const snapshot = await getDoc(doc(firestore, 'finance', 'database'))
  if (!snapshot.exists()) return null
  return snapshot.data()
}

export async function writeFinanceDocument(value: unknown) {
  if (!firestore) throw new Error('O Firestore ainda não está configurado.')
  const plain = JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  await setDoc(doc(firestore, 'finance', 'database'), plain)
}

function rememberFailure(count: number) {
  const next = count + 1
  localStorage.setItem(lockKey, JSON.stringify({ count: next, locked: next >= 3 }))
}

function readLock() {
  try {
    const parsed = JSON.parse(localStorage.getItem(lockKey) || '') as { count?: number; locked?: boolean }
    return { count: parsed.count && parsed.count > 0 ? parsed.count : 0, locked: parsed.locked === true }
  } catch {
    return { count: 0, locked: false }
  }
}
