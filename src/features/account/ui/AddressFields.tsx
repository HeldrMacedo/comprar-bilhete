import type { ComponentProps } from 'react'
import type { FieldErrors, UseFormRegisterReturn } from 'react-hook-form'
import type { AddressForm } from '../service/account-forms'

type AddressFieldName = `address.${keyof AddressForm}`

// Serve a qualquer formulário com o campo `address` (cadastro, Minha conta):
// `fieldProps={(name) => register(name)}`, já que `UseFormRegister` não aceita formulários maiores.
export function AddressFields({
  fieldProps,
  errors,
}: {
  fieldProps: (name: AddressFieldName) => UseFormRegisterReturn
  errors?: FieldErrors<{ address: AddressForm }>['address']
}) {
  return (
    <div className="address-fields">
      <h3>Endereco</h3>
      <div className="form-row">
        <TextField
          label="CEP"
          id="address.zipCode"
          inputMode="numeric"
          autoComplete="postal-code"
          required
          error={errors?.zipCode?.message}
          {...fieldProps('address.zipCode')}
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
    </div>
  )
}

// Campo com rótulo e erro ligado ao input (aria-describedby), usado nos formulários de conta.
export function TextField({
  id,
  label,
  error,
  ...input
}: ComponentProps<'input'> & { id: string; label: string; error?: string }) {
  const errorId = `${id}-error`
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
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
