import * as dotenv from "dotenv"
dotenv.config()

import { selectNearestEligibleBranch, BranchDeliverySettings } from "./src/lib/whatsapp/delivery"

async function run() {
  console.log("Using API Key:", process.env.DISTANCE_API_KEY ? "YES" : "NO")

  const customerLat = 19.1136
  const customerLng = 72.8697

  const branches: BranchDeliverySettings[] = [
    {
      id: "branch_1",
      restaurant_id: "test",
      latitude: 19.1250,
      longitude: 72.8550,
      delivery_enabled: true,
      delivery_free_distance_km: 2,
      delivery_extra_charge_per_km: 10,
      delivery_charge_rounding: "PER_STARTED_KM",
      delivery_max_distance_km: 10,
    },
    {
      id: "branch_2",
      restaurant_id: "test",
      latitude: 19.0500, // Further away
      longitude: 72.8300,
      delivery_enabled: true,
      delivery_free_distance_km: 2,
      delivery_extra_charge_per_km: 10,
      delivery_charge_rounding: "PER_STARTED_KM",
      delivery_max_distance_km: 15,
    }
  ]

  console.log("Testing computeRouteMatrixDistances...")
  const nearest = await selectNearestEligibleBranch(customerLat, customerLng, branches)
  
  if (nearest) {
    console.log("✅ Selected Branch:", nearest.branch.id)
    console.log("   Distance (km):", nearest.distanceKm)
    console.log("   Delivery Charge (₹):", nearest.deliveryCharge)
  } else {
    console.log("❌ No nearest branch found (or API failed)")
  }
}

run().catch(console.error)
