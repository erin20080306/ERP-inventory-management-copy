export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/products/:path*",
    "/customers/:path*",
    "/suppliers/:path*",
    "/purchases/:path*",
    "/sales/:path*",
    "/quotations/:path*",
    "/inventory/:path*",
    "/warehouses/:path*",
    "/returns/:path*",
    "/accounting/:path*",
    "/reports/:path*",
    "/users/:path*",
    "/roles/:path*",
    "/settings/:path*",
    "/audit/:path*",
    "/print/:path*",
    "/admin/:path*",
  ],
};
