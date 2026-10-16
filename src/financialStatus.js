export function calculateFinancialStatus({ monthlyBudget, protectedSavings, totalSpent }) {
  const spendableBudget = monthlyBudget - protectedSavings
  const remainingSpendable = Math.max(spendableBudget - totalSpent, 0)

  if (totalSpent > monthlyBudget) {
    return {
      status: 'budget-exceeded',
      remainingSpendable,
      savingsUsed: 0,
      budgetOverspend: totalSpent - monthlyBudget,
      safeToSpendToday: 0,
    }
  }

  if (totalSpent > spendableBudget) {
    return {
      status: 'savings-breached',
      remainingSpendable,
      savingsUsed: totalSpent - spendableBudget,
      budgetOverspend: 0,
      safeToSpendToday: 0,
    }
  }

  return {
    status: 'on-track',
    remainingSpendable,
    savingsUsed: 0,
    budgetOverspend: 0,
    safeToSpendToday: null,
  }
}
