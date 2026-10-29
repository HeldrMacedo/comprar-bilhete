import { useRef, useState, type ComponentProps, type ReactNode } from 'react'
import type { FieldErrors, UseFormRegisterReturn } from 'react-hook-form'
import { formatZipCode, onlyDigits } from '../../../shared/lib/forms'
import type { ZipCodeAddress } from '../domain/types'
import { useZipCodeLookup } from '../runtime/account-queries'
import type { AddressForm } from '../service/account-forms'

type AddressFieldName = `address.${keyof AddressForm}`

const filledByZipCode = ['street', 'neighborhood', 'city', 'state'] as const

// Serve a qualquer formulário com o campo `address` (cadastro, Minha conta):
// `fieldProps={(name) => register(name)}` e `setField={(name, value) => setValue(name, value)}`,
// já que `UseFormRegister` e `UseFormSetValue` não aceitam formulários maiores.
// CEP completo preenche rua, bairro, cidade e UF; tudo continua editável e o CEP é opcional.
export function AddressFields({
  fieldProps,
  setField,
  errors,
}: {
  fieldProps: (name: AddressFieldName) => UseFormRegisterReturn
  setField: (name: AddressFieldName, value: string) => void
  errors?: FieldErrors<{ address: AddressForm }>['address']
}) {
  const lookup = useZipCodeLookup()
  const [status, setStatus] = useState<string | null>(null)
  // Só a última consulta preenche: resposta atrasada de um CEP antigo é descartada.
  const lastZipCode = useRef('')

  function fill(address: ZipCodeAddress) {
    for (const field of filledByZipCode) {
      if (address[field]) setField(`address.${field}`, address[field].toUpperCase())
    }
    setStatus(address.street ? null : 'CEP geral da cidade: preencha o endereço e o bairro.')
    document.getElementById(address.street ? 'address.number' : 'address.street')?.focus()
  }

  async function searchZipCode(value: string) {
    const zipCode = onlyDigits(value)
    if (zipCode === lastZipCode.current) return
    lastZipCode.current = zipCode
    setStatus(null)
    if (zipCode.length !== 8) return
    try {
      const address = await lookup.mutateAsync(zipCode)
      if (lastZipCode.current !== zipCode) return
      if (address) fill(address)
      else setStatus('CEP não encontrado. Preencha o endereço.')
    } catch {
      if (lastZipCode.current === zipCode) {
        setStatus('Não foi possível buscar o CEP. Preencha o endereço.')
      }
    }
  }

  return (
    <div className="address-fields">
      <h3>Endereco</h3>
      <div className="form-row">
        <TextField
          label="CEP"
          id="address.zipCode"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          maxLength={9}
          error={errors?.zipCode?.message}
          {...fieldProps('address.zipCode')}
          onChange={(event) => {
            const value = formatZipCode(event.target.value)
            setField('address.zipCode', value)
            void searchZipCode(value)
          }}
        />
        <TextField
          label="Endereco"
          id="address.street"
          autoComplete="address-line1"
          required
          error={errors?.street?.message}
          {...fieldProps('address.street')}
        />
      </div>
      <div className="form-row">
        <TextField
          label="Numero"
          id="address.number"
          required
          error={errors?.number?.message}
          {...fieldProps('address.number')}
        />
        <TextField
          label="Complemento"
          id="address.complement"
          error={errors?.complement?.message}
          {...fieldProps('address.complement')}
        />
      </div>
      <div className="form-row">
        <TextField
          label="Bairro"
          id="address.neighborhood"
          required
          error={errors?.neighborhood?.message}
          {...fieldProps('address.neighborhood')}
        />
        <TextField
          label="Cidade"
          id="address.city"
          autoComplete="address-level2"
          required
          error={errors?.city?.message}
          {...fieldProps('address.city')}
        />
      </div>
      <TextField
        label="UF"
        id="address.state"
        maxLength={2}
        autoComplete="address-level1"
        required
        error={errors?.state?.message}
        {...fieldProps('address.state')}
      />
      <p className="address-fields__status" role="status">
        {lookup.isPending ? 'Buscando endereço pelo CEP...' : status}
      </p>
    </div>
  )
}

// Campo com rótulo e erro ligado ao input (aria-describedby), usado nos formulários de conta.
export function TextField({
  id,
  label,
  error,
  required,
  ...input
}: ComponentProps<'input'> & { id: string; label: ReactNode; error?: string }) {
  const errorId = `${id}-error`
  const labelText = typeof label === 'string' ? label : undefined
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? (
          <span className="field__required" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      <input
        id={id}
        required={required}
        aria-label={labelText}
        {...input}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <small id={errorId} role="alert">
          {error}
        </small>
      ) : null}
    </div>
  )
}
