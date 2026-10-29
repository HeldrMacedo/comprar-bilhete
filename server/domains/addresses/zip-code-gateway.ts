// Endereço sugerido para um CEP. Campos vazios quando a base não tem o dado (CEP geral de cidade
// não traz rua nem bairro); o cliente completa à mão.
export type ZipCodeAddress = {
  zipCode: string
  street: string
  neighborhood: string
  city: string
  state: string
}

export interface ZipCodeGateway {
  // `null` quando o CEP não existe na base.
  lookup(zipCode: string): Promise<ZipCodeAddress | null>
}
