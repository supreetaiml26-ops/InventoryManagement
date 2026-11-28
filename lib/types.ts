export type PaymentMethod = "CASH" | "UPI" | "CARD";

export type Product = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minimumStock: number;
  price: number;
  barcode: string | null;
  createdAt?: string | null;
};

export type Movement = {
  id: number;
  productName: string;
  barcode: string | null;
  movementType: "ADD" | "REMOVE";
  quantity: number;
  createdAt: string;
};

export type SaleItem = {
  productName: string;
  quantity: number;
  priceAtSale: number;
  subtotal: number;
};

export type Sale = {
  id: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  createdAt: string | null;
  items: SaleItem[];
};
