import { NextRequest, NextResponse } from "next/server";
export function middleware(request:NextRequest){const password=process.env.SITE_PASSWORD;if(!password)return NextResponse.next();const expected=`Basic ${Buffer.from(`paper:${password}`).toString("base64")}`;if(request.headers.get("authorization")===expected)return NextResponse.next();return new NextResponse("Authentication required",{status:401,headers:{"WWW-Authenticate":'Basic realm="Paper Study"',"Cache-Control":"no-store"}});}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
