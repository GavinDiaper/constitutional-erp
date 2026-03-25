import { McpFunctionDef } from "./catalog";

export const o2cFunctions: McpFunctionDef[] = [
  { name: "o2c_create_quote", domain: "o2c", description: "Create a sales quote" },
  { name: "o2c_add_quote_line", domain: "o2c", description: "Add a quote line" },
  { name: "o2c_send_quote", domain: "o2c", description: "Send a quote" },
  { name: "o2c_accept_quote", domain: "o2c", description: "Accept a quote" },
  { name: "o2c_convert_quote_to_order", domain: "o2c", description: "Convert a quote to order" },
  { name: "o2c_confirm_order", domain: "o2c", description: "Confirm order" },
  { name: "o2c_allocate_stock", domain: "o2c", description: "Allocate stock" },
  { name: "o2c_ship_order", domain: "o2c", description: "Ship order" },
  { name: "o2c_generate_invoice", domain: "o2c", description: "Generate invoice" },
  { name: "o2c_post_invoice", domain: "o2c", description: "Post invoice" },
  { name: "o2c_register_payment", domain: "o2c", description: "Register payment" },
  { name: "o2c_apply_payment_to_invoice", domain: "o2c", description: "Apply payment to invoice" }
];
