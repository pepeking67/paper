import { redirect } from "next/navigation";
import { papers } from "@/lib/papers/catalog";
export default function Home() { redirect(`/papers/${papers[0].id}`); }
