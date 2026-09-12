import prisma from "./src/lib/prisma";
import { 
  calculateRedemption, 
  calculateEarnedPoints, 
  earnPointsTransaction, 
  redeemPointsTransaction, 
  reversePointsTransaction 
} from "./src/lib/loyalty";


async function runTests() {
  console.log("Setting up test customer and restaurant...");
  
  // Get an existing restaurant
  const restaurant = await prisma.restaurant.findFirst();
  if (!restaurant) throw new Error("No restaurant found");

  // Get a branch
  const branch = await prisma.branch.findFirst({ where: { restaurant_id: restaurant.id } });
  if (!branch) throw new Error("No branch found");

  // Create a test customer
  const testPhone = "+919999999999";
  let customer = await prisma.customer.findFirst({
    where: { restaurant_id: restaurant.id, phone: testPhone }
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        restaurant_id: restaurant.id,
        branch_id: branch.id,
        phone: testPhone,
        name: "Loyalty Test User",
        whatsapp_number: testPhone,
        points_balance: 0
      }
    });
  } else {
    // Reset points
    await prisma.customer.update({
      where: { id: customer.id },
      data: { points_balance: 0 }
    });
    customer.points_balance = 0;
    await prisma.pointsLedger.deleteMany({
      where: { customer_id: customer.id }
    });
  }

  // Set loyalty settings
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      loyalty_enabled: true,
      loyalty_points_value_inr: 1, // 1 point = 1 INR
      loyalty_amount_for_one_point: 100, // Earn 1 point per 100 INR
      loyalty_min_order_value: 500,
      loyalty_max_redemption_percent: 50,
    }
  });

  const settings = {
    loyalty_enabled: true,
    loyalty_points_value_inr: 1,
    loyalty_amount_for_one_point: 100,
    loyalty_min_order_value: 500,
    loyalty_max_redemption_percent: 50,
  };

  console.log("--- Test 1: Earn Points ---");
  // Subtotal 1500, so eligible amount 1500. Should earn 15 points.
  const earned = calculateEarnedPoints(1500, settings);
  console.log(`Earned Points for 1500 INR: ${earned} (Expected: 15)`);
  if (earned !== 15) throw new Error("Earn test failed");

  // Simulate order delivered
  await prisma.$transaction(async (tx) => {
    await earnPointsTransaction(tx, customer!.id, restaurant.id, "test_order_1", earned, "Test Earn");
  });

  customer = await prisma.customer.findUnique({ where: { id: customer!.id } }) as any;
  console.log(`Customer Balance: ${customer!.points_balance} (Expected: 15)`);

  console.log("--- Test 2: Redeem Points on Next Order ---");
  // Order 2 subtotal: 1000. Balance: 15. Max % = 50% = 500. Points potential = 15.
  // Can redeem 15 points.
  let redemption = calculateRedemption(1000, customer!.points_balance, settings);
  console.log(`Redeeming on 1000 INR order. Redeemed: ${redemption.redeemablePoints}, Discount: ${redemption.discountValueInr}`);
  if (redemption.redeemablePoints !== 15) throw new Error("Redeem test failed");

  await prisma.$transaction(async (tx) => {
    await redeemPointsTransaction(tx, customer!.id, restaurant.id, "test_order_2", redemption.redeemablePoints, "Test Redeem");
  });

  customer = await prisma.customer.findUnique({ where: { id: customer!.id } }) as any;
  console.log(`Customer Balance after redeem: ${customer!.points_balance} (Expected: 0)`);

  console.log("--- Test 3: Disabled System ---");
  settings.loyalty_enabled = false;
  let disabledEarn = calculateEarnedPoints(1500, settings);
  if (disabledEarn !== 0) throw new Error("Disabled earn failed");
  let disabledRedeem = calculateRedemption(1000, 100, settings);
  if (disabledRedeem.redeemablePoints !== 0) throw new Error("Disabled redeem failed");
  console.log("Disabled system tests passed.");
  settings.loyalty_enabled = true;

  console.log("--- Test 4: Minimum Order Rule ---");
  let minOrderRedeem = calculateRedemption(499, 100, settings);
  if (minOrderRedeem.redeemablePoints !== 0) throw new Error("Min order test failed");
  console.log("Minimum order rule test passed.");

  console.log("--- Test 5: Maximum Redemption % ---");
  // Customer has 5000 points (5000 INR discount potential). Order is 1000. Max 50% = 500 INR.
  let maxRedeem = calculateRedemption(1000, 5000, settings);
  console.log(`Max redemption % test. Redeemed: ${maxRedeem.redeemablePoints} (Expected: 500)`);
  if (maxRedeem.redeemablePoints !== 500) throw new Error("Max redemption test failed");

  console.log("--- Test 6: Cancel / Reversal / Idempotency ---");
  // Refund the redeemed points from test 2 (15 points)
  await prisma.$transaction(async (tx) => {
    await reversePointsTransaction(tx, customer!.id, restaurant.id, "test_order_2", "REFUND", 15, "Refund cancel");
  });

  customer = await prisma.customer.findUnique({ where: { id: customer!.id } }) as any;
  console.log(`Customer Balance after refund: ${customer!.points_balance} (Expected: 15)`);

  // Try duplicate refund (idempotency check)
  let duplicateFailed = false;
  try {
    await prisma.$transaction(async (tx) => {
      await reversePointsTransaction(tx, customer!.id, restaurant.id, "test_order_2", "REFUND", 15, "Duplicate Refund cancel");
    });
  } catch (err) {
    duplicateFailed = true;
  }
  console.log(`Duplicate refund prevented: ${duplicateFailed} (Expected: true)`);
  if (!duplicateFailed) throw new Error("Idempotency test failed");

  console.log("All tests completed successfully!");
}

runTests().catch(console.error).finally(() => process.exit(0));
