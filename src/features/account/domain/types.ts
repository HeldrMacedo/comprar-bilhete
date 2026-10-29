export type Address = {
  zipCode?: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
}
export type Account = {
  cpf: string
  name: string
  email: string | null
  phone: string
  address?: Address
  complete: boolean
}
export type IdentifyResult =
  | { status: 'account' }
  | { status: 'first_access'; maskedEmail: string }
  | { status: 'no_email' }
  | { status: 'new' }
export type Profile = {
  name: string
  cpf: string
  phone: string
  email: string | null
  address: Address
}
// Endereço sugerido pelo CEP; campos vazios quando a base não tem o dado.
export type ZipCodeAddress = {
  zipCode: string
  street: string
  neighborhood: string
  city: string
  state: string
}
export type CodeRequest = { purpose: 'first_access' | 'reset'; cpf: string }
export interface AccountRepository {
  getMe(signal?: AbortSignal): Promise<Account | null>
  identify(cpf: string): Promise<IdentifyResult>
  requestCode(request: CodeRequest): Promise<void>
  login(cpf: string, password: string): Promise<Account>
  register(input: { customer: Profile; password: string }): Promise<Account>
  setPassword(input: {
    cpf: string
    code: string
    password: string
    email?: string
  }): Promise<Account>
  updateProfile(input: {
    customer: Omit<Profile, 'cpf'>
    currentPassword: string
  }): Promise<Account>
  logout(): Promise<void>
  lookupZipCode(zipCode: string): Promise<ZipCodeAddress | null>
}
