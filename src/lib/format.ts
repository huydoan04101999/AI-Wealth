export const formatCurrency = (amount: number | string, currency: 'USD' | 'VND', decimals?: number) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: decimals !== undefined ? decimals : (currency === 'VND' ? 0 : 2),
  }).format(num);
};

export const formatCompactCurrency = (amount: number | string, currency: 'USD' | 'VND') => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (currency === 'VND') {
    if (num >= 1000000000) {
      const billions = Math.floor(num / 1000000000);
      const millions = Math.round((num % 1000000000) / 1000000);
      if (millions > 0) {
        return `${billions} tỷ ${millions} triệu ₫`;
      }
      return `${billions} tỷ ₫`;
    }
    if (num >= 1000000) {
      const millions = Math.round(num / 1000000);
      return `${millions} triệu ₫`;
    }
    return formatCurrency(num, 'VND');
  }

  // For USD, if less than 10,000, don't use compact
  if (currency === 'USD' && num < 10000) {
    return formatCurrency(num, 'USD');
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 2,
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
