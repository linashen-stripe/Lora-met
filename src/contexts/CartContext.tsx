'use client';

import { defaultCartSettings } from '@/config/config';
import { loadFromStorage, saveToStorage } from '@/utils/clientStorage';
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  PropsWithChildren,
} from 'react';

// Define common types
type ItemType = 'product';

interface StripePrice {
  unit_amount: number;
  currency?: string;
  id: string;
}

// Base interface for cart items
interface BaseCartItem {
  id: string;
  type: ItemType;
  quantity: number;
  price?: number;
  details?: any; // Additional info specific to the item type
}

// Product-specific cart item
interface ProductCartItem extends BaseCartItem {
  type: 'product';
  priceId: string;
}

// Union type for any cart item
type CartItem = ProductCartItem;

interface CartState {
  items: CartItem[];
  isCartOpen: boolean;
  shippingMethod: string;
  shippingCost: number;
  discount: number;
  tax: { amount: number; inclusive: boolean };
}

interface CartContextType extends CartState {
  addToCart: (
    id: string,
    type: ItemType,
    details?: any,
    quantity?: number,
    price?: number,
  ) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updateShipping: (method: string, cost: number) => void;
  updateDiscount: (discount: number) => void;
  getCartItems: () => CartItem[];
  calculateTotalItems: () => number;
  calculateSubtotal: () => number;
  calculateTotal: () => number;
  toggleCartOpen: () => void;
  setTax: (amount: number, inclusive: boolean) => void;
  isThereMembershipInCart: () => boolean;
}

const defaultCartContext: CartContextType = {
  items: [],
  isCartOpen: false,
  shippingMethod: 'standard',
  shippingCost: 850,
  discount: 0,
  tax: { amount: 0, inclusive: false },
  addToCart: () => {},
  removeFromCart: () => {},
  clearCart: () => {},
  updateQuantity: () => {},
  updateShipping: () => {},
  updateDiscount: () => {},
  getCartItems: () => [],
  calculateTotalItems: () => 0,
  calculateSubtotal: () => 0,
  calculateTotal: () => 0,
  toggleCartOpen: () => {},
  setTax: () => {},
  isThereMembershipInCart: () => false,
};

const CartContext = createContext<CartContextType>(defaultCartContext);

export function CartProvider({ children }: PropsWithChildren<unknown>) {
  const [cart, setCart] = useState<CartState>(() =>
    loadFromStorage('cart', defaultCartSettings),
  );
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    saveToStorage('cart', cart);
  }, [cart]);

  const updateCartState = useCallback(
    (updater: (prev: CartState) => CartState) => {
      setCart((prev) => {
        const newState = updater(prev);
        saveToStorage('cart', newState);
        return newState;
      });
    },
    [],
  );

  const addToCart = useCallback(
    (
      id: string,
      type: ItemType,
      details?: any,
      quantity = 1,
      price?: number,
    ) => {
      updateCartState((prev) => {
        // Clear out existing items since we only want one type in cart at a time
        const newItems: CartItem[] = [];

        // Add the new item (only product type supported)
        if (type === 'product') {
          newItems.push({
            id,
            type,
            quantity,
            priceId: id,
          });
        }

        return { ...prev, items: newItems };
      });
    },
    [updateCartState],
  );

  const removeFromCart = useCallback(
    (itemId: string) => {
      updateCartState((prev) => ({
        ...prev,
        items: prev.items.filter((item: CartItem) => item.id !== itemId),
      }));
    },
    [updateCartState],
  );

  const updateQuantity = useCallback(
    (itemId: string, newQuantity: number) => {
      updateCartState((prev) => ({
        ...prev,
        items:
          newQuantity <= 0
            ? prev.items.filter((item: CartItem) => item.id !== itemId)
            : prev.items.map((item: CartItem) =>
                item.id === itemId ? { ...item, quantity: newQuantity } : item,
              ),
      }));
    },
    [updateCartState],
  );

  const clearCart = useCallback(() => {
    updateCartState(() => defaultCartSettings);
  }, [updateCartState]);

  const calculateSubtotal = useCallback(
    () =>
      cart.items.reduce(
        (total: number, item: CartItem) =>
          total + (item.price || 0) * item.quantity,
        0,
      ),
    [cart.items],
  );

  const calculateTotalItems = useCallback(
    () =>
      cart.items.reduce(
        (total: number, item: CartItem) => total + item.quantity,
        0,
      ),
    [cart.items],
  );

  const calculateTotal = useCallback(
    () => calculateSubtotal() + cart.shippingCost - cart.discount,
    [calculateSubtotal, cart.shippingCost, cart.discount],
  );

  const toggleCartOpen = useCallback(() => {
    setIsCartOpen((prev) => !prev);
  }, []);

  const updateShipping = useCallback(
    (method: string, cost: number) => {
      updateCartState((prev) => ({
        ...prev,
        shippingMethod: method,
        shippingCost: cost,
      }));
    },
    [updateCartState],
  );

  const updateDiscount = useCallback(
    (discount: number) => {
      updateCartState((prev) => ({ ...prev, discount }));
    },
    [updateCartState],
  );

  const setTax = useCallback(
    (amount: number, inclusive: boolean) => {
      updateCartState((prev) => ({
        ...prev,
        tax: {
          amount,
          inclusive,
        },
      }));
    },
    [updateCartState],
  );

  const isThereMembershipInCart = useCallback(() => {
    return cart.items.some(
      (item) =>
        item.type === 'product' &&
        item.details?.metadata?.product_type === 'membership',
    );
  }, [cart.items]);

  const contextValue = {
    ...cart,
    isCartOpen,
    addToCart,
    removeFromCart,
    clearCart,
    updateQuantity,
    updateShipping,
    updateDiscount,
    getCartItems: useCallback(() => cart.items, [cart.items]),
    calculateTotalItems,
    calculateSubtotal,
    calculateTotal,
    toggleCartOpen,
    setTax,
    isThereMembershipInCart,
  };

  return (
    <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
