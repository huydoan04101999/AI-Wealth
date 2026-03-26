export const formatCurrency = (amount: number | string, currency: 'USD' | 'VND') => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(num);
};

export const formatCompactCurrency = (amount: number | string, currency: 'USD' | 'VND') => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: currency,
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(num);
};

export const parseInputNumber = (val: string): string => {
  if (!val) return '';
  let str = val.toString().replace(/\s/g, '');
  
  if (str.includes('.') && str.includes(',')) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastDot > lastComma) {
      str = str.replace(/,/g, ''); 
    } else {
      str = str.replace(/\./g, '').replace(',', '.'); 
    }
  } else if (str.includes(',')) {
    const parts = str.split(',');
    if (parts.length > 2) {
      str = str.replace(/,/g, '');
    } else {
      if (parts[0] === '0' || parts[1].length !== 3) {
        str = str.replace(',', '.');
      } else {
        str = str.replace(',', '');
      }
    }
  } else if (str.includes('.')) {
     const parts = str.split('.');
     if (parts.length > 2) {
       str = str.replace(/\./g, '');
     } else {
       if (parts[0] !== '0' && parts[1].length === 3) {
         str = str.replace('.', '');
       }
     }
  }
  
  str = str.replace(/[^\d.-]/g, '');
  return str;
};

export const calculateBankValue = (amount: number, interestRate: number, date: string) => {
  const depositDate = new Date(date);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - depositDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Simple interest calculation for the demo: (amount * rate * days) / (365 * 100)
  const interestEarned = (amount * interestRate * diffDays) / (365 * 100);
  return amount + interestEarned;
};
