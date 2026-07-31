import { registerUser } from "@kawabunga/auth";

const users = [
  { name: "Binny Plotkin", email: "binnyplotkin@gmail.com", password: "adventure42" },
  { name: "Sam Kaminer", email: "sam.kaminer@gmail.com", password: "adventure42" },
  { name: "Jonathan Sassoon", email: "jsassoon23@gmail.com", password: "adventure42" },
];

async function main() {
  for (const u of users) {
    try {
      const result = await registerUser(u);
      console.log(`Created: ${u.email} (id: ${result.id})`);
    } catch (e: any) {
      console.log(`${u.email}: ${e.message}`);
    }
  }
}

main();
