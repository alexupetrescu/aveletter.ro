"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CartData } from "./api";
import {
  addCartItem,
  getCart,
  removeCartItem,
  updateCartItem,
} from "./api";

const CART_KEY_STORAGE = "ave_cart_key";

function getOrCreateCartKey(): string {
  let key = window.localStorage.getItem(CART_KEY_STORAGE);
  if (!key) {
    key = crypto.randomUUID();
    window.localStorage.setItem(CART_KEY_STORAGE, key);
  }
  return key;
}

interface CartContextValue {
  cart: CartData | null;
  cartKey: string | null;
  count: number;
  loading: boolean;
  refresh: () => Promise<void>;
  addItem: (payload: {
    product_slug: string;
    variant_id?: number | null;
    options?: number[];
    inputs?: Record<string, unknown>;
    quantity?: number;
  }) => Promise<void>;
  updateItem: (
    itemId: number,
    payload: { quantity?: number },
  ) => Promise<void>;
  removeItem: (itemId: number) => Promise<void>;
  resetAfterCheckout: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartData | null>(null);
  const [cartKey, setCartKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = getOrCreateCartKey();
    setCartKey(key);
    getCart(key)
      .then(setCart)
      .catch(() => setCart(null))
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(async () => {
    if (!cartKey) return;
    setCart(await getCart(cartKey));
  }, [cartKey]);

  const addItem = useCallback<CartContextValue["addItem"]>(
    async (payload) => {
      if (!cartKey) return;
      setCart(await addCartItem(cartKey, payload));
    },
    [cartKey],
  );

  const updateItem = useCallback<CartContextValue["updateItem"]>(
    async (itemId, payload) => {
      if (!cartKey) return;
      setCart(await updateCartItem(cartKey, itemId, payload));
    },
    [cartKey],
  );

  const removeItem = useCallback<CartContextValue["removeItem"]>(
    async (itemId) => {
      if (!cartKey) return;
      setCart(await removeCartItem(cartKey, itemId));
    },
    [cartKey],
  );

  const resetAfterCheckout = useCallback(() => {
    setCart({ id: null, currency: "RON", items: [], subtotal_amount: 0 });
  }, []);

  const count = useMemo(
    () => cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    [cart],
  );

  const value = useMemo(
    () => ({
      cart,
      cartKey,
      count,
      loading,
      refresh,
      addItem,
      updateItem,
      removeItem,
      resetAfterCheckout,
    }),
    [cart, cartKey, count, loading, refresh, addItem, updateItem, removeItem, resetAfterCheckout],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
