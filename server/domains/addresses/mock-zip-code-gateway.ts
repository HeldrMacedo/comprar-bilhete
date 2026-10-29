import type { ZipCodeAddress, ZipCodeGateway } from './zip-code-gateway.js'

const addresses: ZipCodeAddress[] = [
  {
    zipCode: '59062300',
    street: 'Avenida Lima e Silva',
    neighborhood: 'Nossa Senhora de Nazaré',
    city: 'Natal',
    state: 'RN',
  },
]

export class MockZipCodeGateway implements ZipCodeGateway {
  async lookup(zipCode: string) {
    const address = addresses.find((item) => item.zipCode === zipCode)
    return address ? { ...address } : null
  }
}
