'use client';

interface CartState {
  items: any[]; // CartItem
  isCartOpen: boolean;
  shippingMethod: string;
  shippingCost: number;
  discount: number;
}

export const loadFromStorage = (key: string, defaultValue: any) => {
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : defaultValue;
};

export const saveToStorage = (key: string, value: any) => {
  localStorage.setItem(key, JSON.stringify(value));
};
