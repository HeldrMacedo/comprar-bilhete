export function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11)
  return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false

  const calculateDigit = (length: number) => {
    const total = cpf
      .slice(0, length)
      .split('')
      .reduce((sum, digit, index) => sum + Number(digit) * (length + 1 - index), 0)
    const remainder = (total * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10])
}
