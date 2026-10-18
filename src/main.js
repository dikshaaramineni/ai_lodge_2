import { computed, createApp, onMounted, reactive, ref, watch } from 'vue'
import './styles.css'
import { calculateFinancialStatus } from './financialStatus'

const categories = ['Food & drink', 'Transport', 'Shopping', 'Fun', 'Bills', 'Health', 'Other']
const ACTIVE_USER_STORAGE_KEY = 'cashling-active-user'
const STORAGE_KEY = 'cashling-mvp-state-v3'
const PREVIOUS_STORAGE_KEY = 'cashling-mvp-state-v2'
const LEGACY_STORAGE_KEYS = ['cashling-mvp-state']
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
console.log('[CashLing] API base:', API_BASE_URL)
const TRANSACTIONS_API_URL = `${API_BASE_URL}/api/transactions`
const BUDGET_API_URL = `${API_BASE_URL}/api/budget`
const STREAKS_API_URL = `${API_BASE_URL}/api/streaks`
const COMMUNITY_API_URL = `${API_BASE_URL}/api/community`
const ACHIEVEMENTS_API_URL = `${STREAKS_API_URL}/achievements`
const profiles = [
  { userId: 'user_alex', name: 'Alex', initials: 'A', description: 'new user', detail: 'little/no transaction history', fresh: true },
  { userId: 'user_chloe', name: 'Chloe', initials: 'C', description: 'intermediate user', detail: 'about 1 month of history' },
  { userId: 'user_sarah', name: 'Sarah', initials: 'S', description: 'established user', detail: 'about 2 months of history' },
]
function dateInput(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function localDate(value) { return new Date(`${value}T00:00:00`) }
function addDays(value, amount) { const date = localDate(value); date.setDate(date.getDate() + amount); return dateInput(date) }
function startOfWeek(date = new Date()) { const day = date.getDay() || 7; const monday = new Date(date); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - day + 1); return monday }
function periodKey(budget) { return `${budget.start}:${budget.end}` }
function initialState() {
  const today = new Date()
  return {
    budget: { monthly: 0, savings: 0, start: dateInput(new Date(today.getFullYear(), today.getMonth(), 1)), end: dateInput(new Date(today.getFullYear(), today.getMonth() + 1, 0)), configured: false },
    expenses: [],
    progress: { dailyRecords: [], weeklyPointsAwarded: [], allowanceDate: '', allowancePeriod: '', dailyAllowance: null, currentStreak: 0, lastResultDate: '' },
     community: { friends: [], friendRequests: [], buddy: null, availableWin: '', shareDecisions: {}, incomingNudge: false, demoOpen: false },
    demo: { active: false, scenario: 0, completed: [false, false, false] },
  }
}
function loadState(userId) {
  try {
    LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key))
    const currentSaved = localStorage.getItem(`${STORAGE_KEY}:${userId}`)
    const migratedSaved = !currentSaved && localStorage.getItem(`${PREVIOUS_STORAGE_KEY}:${userId}`)
    const saved = JSON.parse(currentSaved || migratedSaved || 'null')
    if (saved) {
      const base = initialState()
      const { rewards: obsoleteRewards, ...cleanSaved } = saved
       const { joinedChallenges: obsoleteChallenges, points: obsoletePoints, sharedWins: obsoleteSharedWins, ...cleanCommunity } = saved.community || {}
      if (migratedSaved) {
        cleanSaved.progress = { ...cleanSaved.progress, allowanceDate: '', allowancePeriod: '', dailyAllowance: null }
        console.info('[CashLing] migrated legacy allowance state', { userId })
      }
      const restoredState = {
        ...base, ...cleanSaved,
        budget: { ...base.budget, ...cleanSaved.budget },
        progress: { ...base.progress, dailyRecords: saved.progress?.dailyRecords || [], weeklyPointsAwarded: saved.progress?.weeklyPointsAwarded || [], allowanceDate: saved.progress?.allowanceDate || '', allowancePeriod: saved.progress?.allowancePeriod || '', dailyAllowance: saved.progress?.dailyAllowance ?? null, currentStreak: saved.progress?.currentStreak ?? 0, lastResultDate: saved.progress?.lastResultDate || '' },
         community: { ...base.community, ...cleanCommunity, friends: saved.community?.friends || [], shareDecisions: saved.community?.shareDecisions || {}, incomingNudge: saved.community?.incomingNudge || false, availableWin: '' },
        demo: { ...base.demo, ...saved.demo },
      }
      console.log('[ACTIVE DAY RESTORED]', restoredState.progress.allowanceDate)
      return restoredState
    }
  } catch { /* Recover gracefully from older or malformed localStorage. */ }
  return initialState()
}

const App = {
  setup() {
    const activeUserId = ref(localStorage.getItem(ACTIVE_USER_STORAGE_KEY) || '')
    const state = reactive(loadState(activeUserId.value))
    const view = ref('overview')
    const wrappedIndex = ref(0)
    const demoMode = ref(false)
    const showForm = ref(false)
     const showBudgetModal = ref(activeUserId.value === 'user_alex' && !state.budget.configured)
     const showAddFriend = ref(false)
     const removeFriendTarget = ref(null)
    const showProfileSelector = ref(!activeUserId.value)
    const friendUsername = ref('')
    const showDetails = ref(false)
     const toast = ref('')
     const apiTransactions = ref([])
     const streakData = ref(null)
      const communityPosts = ref([])
      const pendingAchievements = ref([])
      const overviewNotifications = ref([])
     const communityPostsLoading = ref(false)
     const communityFeedExpanded = ref(false)
     const relationshipData = ref({ friends: [], incomingRequests: [] })
     const transactionsLoading = ref(true)
     const transactionsError = ref('')
      const budgetError = ref('')
      const expenseSubmitting = ref(false)
      const expenseError = ref('')
    const amount = ref('')
    const category = ref(categories[0])
    const description = ref('')
    const expenseDate = ref(state.progress.allowanceDate || dateInput(new Date()))
    const budgetForm = reactive({ ...state.budget })
     const activeProfile = computed(() => profiles.find(profile => profile.userId === activeUserId.value) || null)
     const activeDay = computed(() => state.progress.allowanceDate || dateInput(new Date()))
     let profileLoadSequence = 0
     let currentProfileLoad = null

    const inBudgetPeriod = (date) => date >= state.budget.start && date <= state.budget.end
    const currentPeriodExpenses = computed(() => state.expenses.filter(item => inBudgetPeriod(item.date)))
    const periodDays = computed(() => Math.max(1, Math.ceil((localDate(state.budget.end) - localDate(state.budget.start)) / 86400000) + 1))
    const daysRemaining = computed(() => {
      if (!state.budget.configured) return 0
      const day = localDate(activeDay.value)
      if (day < localDate(state.budget.start)) return periodDays.value
      if (day > localDate(state.budget.end)) return 0
      return Math.max(0, Math.ceil((localDate(state.budget.end) - day) / 86400000) + 1)
    })
    const budgetMetrics = computed(() => {
      const monthlyBudget = Number(state.budget.monthly) || 0
      const savingsGoal = Number(state.budget.savings) || 0
      const currentPeriodSpending = currentPeriodExpenses.value.reduce((sum, item) => sum + Number(item.amount), 0)
      const financialStatus = calculateFinancialStatus({ monthlyBudget, protectedSavings: savingsGoal, totalSpent: currentPeriodSpending })
      const spendableBudget = monthlyBudget - savingsGoal
      const remainingSpendable = financialStatus.remainingSpendable
       const remainingDays = daysRemaining.value
       const today = activeDay.value
       const calculatedDailyAllowance = remainingDays > 0 ? Math.max(remainingSpendable / remainingDays, 0) : 0
        const savedAllowanceIsCurrent = state.progress.allowanceDate === today && state.progress.allowancePeriod === periodKey(state.budget) && state.progress.dailyAllowance !== null && Number.isFinite(Number(state.progress.dailyAllowance))
       const periodFinished = dateInput(new Date()) > state.budget.end
       const dailyAllowance = periodFinished ? 0 : financialStatus.status === 'on-track'
         ? (savedAllowanceIsCurrent ? Math.max(Number(state.progress.dailyAllowance), 0) : calculatedDailyAllowance)
         : 0
      const todaySpending = currentPeriodExpenses.value.filter(item => item.date === today).reduce((sum, item) => sum + Number(item.amount), 0)
      const dailyProgressPercent = dailyAllowance > 0 ? todaySpending / dailyAllowance * 100 : todaySpending > 0 ? 100 : 0
      return { monthlyBudget, savingsGoal, spendableBudget, currentPeriodSpending, remainingSpendable, remainingDays, calculatedDailyAllowance, dailyAllowance, safeToday: dailyAllowance, todaySpending, dailyProgressPercent, ...financialStatus, safeToSpendToday: dailyAllowance }
    })
    const totalSpent = computed(() => budgetMetrics.value.currentPeriodSpending)
    const spendableAmount = computed(() => budgetMetrics.value.spendableBudget)
    const remainingSpendable = computed(() => budgetMetrics.value.remainingSpendable)
    const elapsedDays = computed(() => Math.max(1, periodDays.value - budgetMetrics.value.remainingDays))
    const safeDailySpend = computed(() => budgetMetrics.value.safeToday)
    const financialStatus = computed(() => budgetMetrics.value.status)
    const todayOverage = computed(() => Math.max(0, budgetMetrics.value.todaySpending - budgetMetrics.value.safeToday))
    const averageDailySpend = computed(() => totalSpent.value / elapsedDays.value)
    const projectedSpend = computed(() => totalSpent.value + averageDailySpend.value * daysRemaining.value)
    const expectedLeftover = computed(() => spendableAmount.value - projectedSpend.value)
    const overspendAmount = computed(() => Math.max(0, -expectedLeftover.value))
    const riskStatus = computed(() => projectedSpend.value > spendableAmount.value ? 'LIKELY TO EXCEED' : projectedSpend.value > spendableAmount.value * 0.9 ? 'AT RISK' : 'ON TRACK')
    const statusClass = computed(() => riskStatus.value === 'ON TRACK' ? 'on-track' : riskStatus.value === 'AT RISK' ? 'watchful' : 'at-risk')
    const percentSpent = computed(() => spendableAmount.value > 0 ? Math.min(100, Math.round(totalSpent.value / spendableAmount.value * 100)) : 0)
    const recentExpenses = computed(() => state.expenses.filter(expense => expense.date === activeDay.value).slice(0, 3))
     const categoryTotals = computed(() => categories.map(name => ({ name, total: currentPeriodExpenses.value.filter(item => item.category === name).reduce((sum, item) => sum + Number(item.amount), 0) })).filter(item => item.total > 0).sort((a, b) => b.total - a.total))
      const renderedTransactions = computed(() => {
        console.info('[CashLing] rendered transactions', { activeUserId: activeUserId.value, count: apiTransactions.value.length })
        return apiTransactions.value
      })
      const apiCategoryTotals = computed(() => Object.entries(renderedTransactions.value.reduce((totals, item) => {
       if (!item.category) return totals
       totals[item.category] = (totals[item.category] || 0) + Number(item.amount)
       return totals
     }, {})).map(([name, total]) => ({ name, total })).filter(item => item.total > 0).sort((a, b) => b.total - a.total))
    const expenseTotalsByDate = computed(() => currentPeriodExpenses.value.reduce((totals, expense) => { totals[expense.date] = (totals[expense.date] || 0) + Number(expense.amount); return totals }, {}))
    const formattedPeriod = computed(() => `${formatDate(state.budget.start)} – ${formatDate(state.budget.end)}`)

    const completedWeek = computed(() => {
      const monday = startOfWeek()
      monday.setDate(monday.getDate() - 7)
      return { start: dateInput(monday), end: dateInput(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) }
    })
    const previousWeek = computed(() => ({ start: addDays(completedWeek.value.start, -7), end: addDays(completedWeek.value.end, -7) }))
    const inRange = (date, range) => date >= range.start && date <= range.end
    const wrappedExpenses = computed(() => state.expenses)
    const wrappedExpenseTotalsByDate = computed(() => wrappedExpenses.value.reduce((totals, expense) => { totals[expense.date] = (totals[expense.date] || 0) + Number(expense.amount); return totals }, {}))
    const weekExpenses = computed(() => wrappedExpenses.value.filter(item => inRange(item.date, completedWeek.value)))
    const previousWeekExpenses = computed(() => wrappedExpenses.value.filter(item => inRange(item.date, previousWeek.value)))
    const weekTotal = computed(() => weekExpenses.value.reduce((sum, item) => sum + Number(item.amount), 0))
    const previousWeekTotal = computed(() => previousWeekExpenses.value.reduce((sum, item) => sum + Number(item.amount), 0))
    const weekCategoryTotals = computed(() => categories.map(name => ({ name, total: weekExpenses.value.filter(item => item.category === name).reduce((sum, item) => sum + Number(item.amount), 0), count: weekExpenses.value.filter(item => item.category === name).length })).filter(item => item.total > 0).sort((a, b) => b.total - a.total))
    const weekDayTotals = computed(() => Object.entries(weekExpenses.value.reduce((days, item) => { days[item.date] = (days[item.date] || 0) + Number(item.amount); return days }, {})).sort((a, b) => b[1] - a[1]))
    const weeklyOnTrackDays = computed(() => demoMode.value ? 5 : state.progress.dailyRecords.filter(record => inRange(record.date, completedWeek.value) && record.status === 'success').length)
    const weeklyTransactions = computed(() => weekExpenses.value.length)
     const weekComparison = computed(() => previousWeekExpenses.value.length ? Math.round((weekTotal.value - previousWeekTotal.value) / Math.max(1, previousWeekTotal.value) * 100) : null)
     const weeklyWrappedAvailable = computed(() => weekExpenses.value.length > 0)
      const insightTransactions = computed(() => renderedTransactions.value.filter(item => {
       const amountValue = Number(item.amount)
       return item && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && !Number.isNaN(localDate(item.date).getTime()) && Number.isFinite(amountValue) && amountValue > 0 && typeof item.category === 'string' && item.category.trim()
     }).map(item => ({ ...item, amount: Number(item.amount), category: item.category.trim() })))
     const insightPeriod = computed(() => {
       const transactions = insightTransactions.value
       if (!transactions.length) return { start: '', end: '', label: 'Based on your recent spending' }
       const end = transactions.reduce((latest, item) => item.date > latest ? item.date : latest, transactions[0].date)
       const start = addDays(end, -29)
       const recent = transactions.filter(item => item.date >= start && item.date <= end)
       const earliest = transactions.reduce((first, item) => item.date < first ? item.date : first, transactions[0].date)
       return { start, end, label: earliest <= start ? 'Based on your last 30 days' : 'Based on your recent spending' }
     })
     const insightData = computed(() => {
       const { start, end } = insightPeriod.value
       const recent = insightTransactions.value.filter(item => item.date >= start && item.date <= end)
       const total = recent.reduce((sum, item) => sum + item.amount, 0)
       const byCategory = Object.values(recent.reduce((groups, item) => {
         const name = item.category.trim()
         if (!name) return groups
         groups[name] = groups[name] || { name, total: 0, count: 0 }
         groups[name].total += item.amount
         groups[name].count += 1
         return groups
       }, {})).sort((a, b) => b.total - a.total)
       return { recent, total, byCategory }
     })
      const insightsCards = computed(() => {
       const { recent, total, byCategory } = insightData.value
       if (recent.length < 5 || !total || !byCategory.length) return []
       const cards = []
       const biggest = byCategory[0]
       const frequent = [...byCategory].sort((a, b) => b.count - a.count || b.total - a.total)[0]
       const dayTotals = Object.entries(recent.reduce((days, item) => { days[item.date] = (days[item.date] || 0) + item.amount; return days }, {})).sort((a, b) => b[1] - a[1])
       const biggestDay = dayTotals[0]
       const transactionShare = recent.length
       const costDriver = byCategory.find(item => item.total / total >= 0.25 && item.count / transactionShare < item.total / total - 0.1)
       cards.push({ label: 'BIGGEST CATEGORY', title: `${biggest.name} accounts for ${Math.round(biggest.total / total * 100)}% of your spending.`, body: `${money(biggest.total)} spent across ${biggest.count} purchase${biggest.count === 1 ? '' : 's'}.`, tone: 'peach', progress: Math.round(biggest.total / total * 100) })
       if (frequent?.name && frequent.count > 0) cards.push({ label: 'MOST FREQUENT', title: `${frequent.name} is your most frequent purchase category.`, body: `${frequent.count} transaction${frequent.count === 1 ? '' : 's'} in this period.`, tone: 'mint' })
       if (recent.length >= 15 && costDriver?.name) cards.push({ label: 'COST VS FREQUENCY', title: `${costDriver.name} made up only ${Math.round(costDriver.count / transactionShare * 100)}% of your transactions but ${Math.round(costDriver.total / total * 100)}% of your total spending.`, body: 'A few higher-cost purchases can matter as much as frequent smaller ones.', tone: 'gold' })
       const smallPurchases = recent.filter(item => item.amount < 10)
       const smallTotal = smallPurchases.reduce((sum, item) => sum + item.amount, 0)
       if (recent.length >= 15 && smallPurchases.length >= 3 && smallTotal >= 20) cards.push({ label: 'SMALL PURCHASES', title: `You made ${smallPurchases.length} purchases under $10.`, body: `Together, they added up to ${money(smallTotal)}.`, tone: 'lavender' })
       if (biggestDay?.[0]) cards.push({ label: 'HIGHEST SPENDING DAY', title: `${localDate(biggestDay[0]).toLocaleDateString(undefined, { weekday: 'long' })} was your highest-spending day.`, body: `${money(biggestDay[1])} spent on ${formatDate(biggestDay[0])}.`, tone: 'gold' })
       if (recent.length >= 15) {
         const weekend = recent.filter(item => [0, 6].includes(localDate(item.date).getDay()))
         const weekday = recent.filter(item => ![0, 6].includes(localDate(item.date).getDay()))
         const weekendDays = new Set(weekend.map(item => item.date)).size
         const weekdayDays = new Set(weekday.map(item => item.date)).size
         const weekendAverage = weekend.reduce((sum, item) => sum + item.amount, 0) / Math.max(1, weekendDays)
         const weekdayAverage = weekday.reduce((sum, item) => sum + item.amount, 0) / Math.max(1, weekdayDays)
         if (weekendDays >= 2 && weekdayDays >= 3 && weekdayAverage > 0 && Math.abs(weekendAverage / weekdayAverage - 1) >= 0.05) cards.push({ label: 'WEEKEND VS WEEKDAY', title: `Your average weekend spending is ${Math.round(Math.abs(weekendAverage / weekdayAverage - 1) * 100)}% ${weekendAverage >= weekdayAverage ? 'higher' : 'lower'} than your weekday average.`, body: `${money(weekendAverage)} per weekend day versus ${money(weekdayAverage)} on weekdays.`, tone: 'mint' })
       }
       if (recent.length >= 15) {
         const previousStart = addDays(insightPeriod.value.start, -30)
         const previous = insightTransactions.value.filter(item => item.date >= previousStart && item.date < insightPeriod.value.start)
         if (previous.length >= 5) {
           const previousByCategory = previous.reduce((groups, item) => { groups[item.category] = (groups[item.category] || 0) + item.amount; return groups }, {})
           const changed = byCategory.map(item => ({ ...item, previous: previousByCategory[item.name] || 0, change: item.total - (previousByCategory[item.name] || 0) })).filter(item => item.previous > 0).sort((a, b) => Math.abs(b.change / b.previous) - Math.abs(a.change / a.previous))[0]
           if (changed?.name && Math.abs(changed.change / changed.previous) >= 0.1) cards.push({ label: 'CHANGE OVER TIME', title: `Your ${changed.name.toLowerCase()} spending ${changed.change <= 0 ? 'decreased' : 'increased'} ${Math.round(Math.abs(changed.change / changed.previous) * 100)}% compared with the previous 30 days.`, body: `${money(changed.total)} recently versus ${money(changed.previous)} previously.`, tone: 'peach' })
         }
       }
       const spendableBudget = Number(state.budget.monthly) - Number(state.budget.savings)
       if (recent.length >= 15 && spendableBudget > 0) cards.push({ label: 'BUDGET PRESSURE', title: `${biggest.name} currently uses the largest share of your spendable budget.`, body: `${money(biggest.total)} is ${Math.round(biggest.total / spendableBudget * 100)}% of your ${money(spendableBudget)} spendable plan.`, tone: 'lavender' })
        return cards.filter(card => card.title && card.body && !/undefined|null|NaN/.test(`${card.title} ${card.body}`))
      })
      const historicalAchievements = computed(() => {
        const end = insightPeriod.value.end
        const start = insightPeriod.value.start
        if (!start || !end) return []
        const previousStart = addDays(start, -30)
        const current = insightTransactions.value.filter(item => item.date >= start && item.date <= end)
        const previous = insightTransactions.value.filter(item => item.date >= previousStart && item.date < start)
        if (previous.length < 5) return []
        const achievements = []
        const currentByCategory = current.reduce((groups, item) => { groups[item.category] = (groups[item.category] || 0) + item.amount; return groups }, {})
        const previousByCategory = previous.reduce((groups, item) => { groups[item.category] = (groups[item.category] || 0) + item.amount; return groups }, {})
        Object.entries(currentByCategory).forEach(([category, total]) => {
          const prior = previousByCategory[category]
          if (prior > 0 && total < prior * 0.9) achievements.push({ key: `history-category-${category}-${start}`, earnedDate: end, text: `${category} spending decreased ${Math.round((prior - total) / prior * 100)}% compared with the previous period.` })
        })
        const weekendTotal = items => items.filter(item => [0, 6].includes(localDate(item.date).getDay())).reduce((sum, item) => sum + item.amount, 0)
        const previousWeekend = weekendTotal(previous)
        const currentWeekend = weekendTotal(current)
        if (previousWeekend > 0 && currentWeekend < previousWeekend * 0.9) achievements.push({ key: `history-weekend-${start}`, earnedDate: end, text: `Weekend spending improved ${Math.round((previousWeekend - currentWeekend) / previousWeekend * 100)}% compared with the previous period.` })
        const currentSmall = current.filter(item => item.amount < 10).length
        const previousSmall = previous.filter(item => item.amount < 10).length
        if (currentSmall < previousSmall) achievements.push({ key: `history-small-purchases-${start}`, earnedDate: end, text: 'You made fewer small purchases than the previous period.' })
        return achievements
      })
    const mostFrequentCategory = computed(() => [...weekCategoryTotals.value].sort((a, b) => b.count - a.count)[0] || null)
    const bestBudgetDay = computed(() => {
      const days = Object.entries(wrappedExpenseTotalsByDate.value).filter(([date]) => inRange(date, completedWeek.value)).map(([date, total]) => ({ date, total: Number(total), difference: safeDailySpend.value - Number(total) })).filter(day => day.difference >= 0).sort((a, b) => b.difference - a.difference)
      return days[0] || null
    })
    const wrapCards = computed(() => {
      if (!weeklyWrappedAvailable.value) return []
      const biggestCategory = weekCategoryTotals.value[0]
      const biggestDay = weekDayTotals.value[0]
      const onTrack = weeklyOnTrackDays.value
      if (!weekTotal.value || !biggestCategory || !biggestDay || !mostFrequentCategory.value) return []
      const insight = weekCategoryTotals.value.length > 1 && weekCategoryTotals.value[0].total > weekCategoryTotals.value[1].total * 1.5
        ? `${biggestCategory.name} is your clear spending pattern this week.`
        : weekDayTotals.value.filter(([date]) => [0, 6].includes(localDate(date).getDay())).reduce((sum, [, total]) => sum + total, 0) > weekTotal.value * 0.5
          ? 'Most of your spending happened over the weekend.'
          : weeklyTransactions.value > 5 ? 'Small, frequent purchases made up most of your week.' : 'Your spending was spread across a few intentional choices.'
      const recommendation = biggestCategory ? `Try keeping ${biggestCategory.name.toLowerCase()} below ${money(Math.max(1, biggestCategory.total * 0.85))} next week.` : `Keep daily spending below ${money(safeDailySpend.value)} to protect your savings goal.`
      const cards = [
        { label: 'YOUR WEEK', title: `You spent ${money(weekTotal.value)} this week.`, body: weekComparison.value === null ? 'Keep logging to unlock a week-over-week comparison.' : `${Math.abs(weekComparison.value)}% ${weekComparison.value <= 0 ? 'less' : 'more'} than last week.`, tone: 'lavender' },
        { label: 'CATEGORY CROWN', title: `${biggestCategory.name} took the crown.`, body: `${money(biggestCategory.total)} · ${Math.round(biggestCategory.total / weekTotal.value * 100)}% of your weekly spending.`, tone: 'peach' },
        { label: 'YOUR PATTERN', title: `${mostFrequentCategory.name} was your most frequent spend.`, body: `${mostFrequentCategory.count} purchase${mostFrequentCategory.count === 1 ? '' : 's'} this week.`, tone: 'mint' },
        { label: 'BIGGEST DAY', title: `${formatDate(biggestDay[0])} was your biggest spending day.`, body: `${money(biggestDay[1])} · ${Math.round(biggestDay[1] / weekTotal.value * 100)}% of weekly spending happened in one day.`, tone: 'gold' },
        { label: 'STRONGEST DAY', title: bestBudgetDay.value ? `${formatDate(bestBudgetDay.value.date)} was your strongest budgeting day.` : 'Your strongest day is still forming.', body: bestBudgetDay.value ? `${money(bestBudgetDay.value.difference)} under your safe daily pace.` : 'Log a completed day within your pace to see it here.', tone: 'mint' },
         { label: 'ON-TRACK DAYS', title: `You stayed within your pace on ${onTrack} of 7 days.`, body: 'A completed-day result from your saved daily spending limits.', tone: 'lavender' },
        { label: 'A LITTLE INSIGHT', title: insight, body: 'A simple pattern from your real transactions this week.', tone: 'peach' },
        { label: 'NEXT WEEK', title: 'One calm next step.', body: recommendation, tone: 'gold' },
      ]
      return cards.filter(card => card && card.title && card.body && !/undefined|null|NaN/.test(`${card.title} ${card.body}`))
    })

    const currentWeekRecords = computed(() => demoMode.value ? Array.from({ length: 5 }, (_, index) => ({ date: addDays(completedWeek.value.start, index), status: 'success' })) : state.progress.dailyRecords.filter(record => inRange(record.date, completedWeek.value)))
       const allCommunityFeed = computed(() => communityPosts.value.map(post => ({ ...post, icon: '✦' })))
       const communityFeed = computed(() => communityFeedExpanded.value ? allCommunityFeed.value : allCommunityFeed.value.slice(0, 5))
       const communityFeedHasMore = computed(() => allCommunityFeed.value.length > 5)
        const positiveInsightCards = computed(() => insightsCards.value.filter(card => card.label === 'CHANGE OVER TIME' && /decreased/i.test(card.title)))
        const positiveInsightCandidate = computed(() => positiveInsightCards.value[0] || null)
         const isShareableOnActiveDay = achievement => {
           if (!achievement?.earnedDate) return true
           return activeDay.value === addDays(achievement.earnedDate, 1)
        }
         const shareableAchievements = computed(() => {
           const achievements = [
             ...pendingAchievements.value.map(achievement => ({ key: achievement.key, text: achievement.text, id: achievement._id, type: achievement.type, status: achievement.status, earnedDate: achievement.earnedDate, milestone: achievement.milestone, buddyUserId: achievement.buddyUserId })),
            ...positiveInsightCards.value.map(card => ({ key: `insight-${card.title}-${insightPeriod.value.end}`, text: card.title, earnedDate: insightPeriod.value.end })),
            ...historicalAchievements.value,
          ]
        const seen = new Set()
        const eligibility = achievements.map(achievement => {
          const dateEligible = isShareableOnActiveDay(achievement)
          const duplicate = seen.has(achievement.key)
          const decisionEligible = Boolean(achievement.id || !state.community.shareDecisions[achievement.key])
          const accepted = dateEligible && !duplicate
          if (!duplicate) seen.add(achievement.key)
          return {
            candidate: achievement,
            accepted,
            reason: !dateEligible ? 'active day is not earned date + 1' : duplicate ? 'duplicate candidate key' : !decisionEligible ? 'eligible candidate, but already decided' : 'eligible',
          }
        })
        console.log('[WIN ELIGIBILITY]', {
          activeDay: activeDay.value,
          candidates: eligibility.map(item => ({
            id: item.candidate.id,
            type: item.candidate.type,
            earnedDate: item.candidate.earnedDate,
            accepted: item.accepted,
            reason: item.reason,
          })),
        })
        return eligibility.filter(item => item.accepted).map(item => item.candidate)
      })
        const shareableWin = computed(() => {
          const candidates = shareableAchievements.value
          console.log('[WIN ELIGIBILITY]', {
            activeDay: activeDay.value,
            candidates: candidates.map(achievement => ({ id: achievement.id, type: achievement.type, status: achievement.status, earnedDate: achievement.earnedDate, accepted: true, reason: 'eligible candidate' })),
          })
          return candidates.find(achievement => achievement.id || !state.community.shareDecisions[achievement.key])?.text || null
        })
       watch(pendingAchievements, value => console.log('[WIN] pending achievements', value), { deep: true, immediate: true })
       watch(positiveInsightCandidate, value => console.log('[WIN] positive insight candidate', value), { deep: true, immediate: true })
       watch(() => shareableWin.value, value => console.log('[WIN] final shareableWin', value), { immediate: true })
      const personalStreak = computed(() => streakData.value?.currentStreak ?? 0)
       const streakRelationships = computed(() => streakData.value?.relationships || (streakData.value?.buddy ? [streakData.value.buddy] : []))
       const buddies = computed(() => streakRelationships.value.map(relationship => {
         const buddyId = relationship.userIds.find(userId => userId !== activeUserId.value)
         const profile = profiles.find(item => item.userId === buddyId)
         return { ...relationship, buddyUserId: buddyId, name: relationship.buddyName || profile?.name || 'Savings Buddy', accepted: relationship.status === 'active', friendStatus: relationship.status === 'broken' ? 'failed' : relationship.status }
       }))
       const buddyProfileName = computed(() => buddies.value[0]?.name || '')
       const buddyProfileId = computed(() => buddies.value[0]?.buddyUserId || '')
     const currentUserStatus = computed(() => `${state.progress.dailyRecords.find(record => record.date === dateInput(new Date()))?.status === 'success' ? 'On track' : 'Pending'} · Your streak: ${personalStreak.value} days`)
      const buddy = computed(() => buddies.value[0] || null)
    const nudgeSentToday = computed(() => state.community.buddy?.lastNudge === dateInput(new Date()))
    const buddyFriendUsage = computed(() => state.community.buddy?.friendUsage ?? 0)
      const friends = computed(() => (relationshipData.value.friends || []).filter(friend => !buddies.value.some(relationship => relationship.buddyUserId === friend.userId)))
     const incomingFriendRequests = computed(() => relationshipData.value.incomingRequests || [])

    function formatDate(value) { return value ? localDate(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Not set' }
    function money(value) { const amountValue = Number(value) || 0; return `${amountValue < 0 ? '-$' : '$'}${Math.abs(amountValue).toFixed(2)}` }
     function notify(message) { toast.value = message; window.setTimeout(() => { toast.value = '' }, 3000) }
     function notifySequence(messages) { messages.filter(Boolean).forEach((message, index) => window.setTimeout(() => notify(message), index * 3200)) }
     function persist() { if (activeUserId.value) localStorage.setItem(`${STORAGE_KEY}:${activeUserId.value}`, JSON.stringify(state)) }
      async function loadStreaks(userId = activeUserId.value) {
        console.log('[NOTIFICATIONS LOAD START]', userId)
       try {
           const requestUrl = `${STREAKS_API_URL}?userId=${encodeURIComponent(userId)}&activeDay=${encodeURIComponent(activeDay.value)}`
           console.log('[STREAK REQUEST ACTIVE DAY]', activeDay.value)
           console.log('[STREAK REQUEST URL]', requestUrl)
            const response = await fetch(requestUrl)
         console.log('STREAK B response', response.status)
         if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
           const data = await response.json()
           console.log('STREAK C data', data)
           console.log('[RAW STREAK ACHIEVEMENTS]', data.achievements)
           console.log('[WIN DEBUG]', {
             activeDay: activeDay.value,
             pendingAchievements: (data.achievements || []).map(achievement => ({
               id: achievement._id,
               type: achievement.type,
               status: achievement.status,
               earnedDate: achievement.earnedDate,
               milestone: achievement.milestone,
               buddyUserId: achievement.buddyUserId,
             })),
           })
          if (userId === activeUserId.value) {
              streakData.value = data
              pendingAchievements.value = data.achievements || []
              console.log('[PENDING ACHIEVEMENTS ASSIGNED]', pendingAchievements.value)
              console.log('[WIN TRACE]', {
                activeUserId: activeUserId.value,
                activeDay: activeDay.value,
                pendingAchievements: pendingAchievements.value,
              })
               state.progress.currentStreak = data.currentStreak
              state.progress.lastResultDate = data.lastResultDate
          }
       } catch (error) {
         console.error('Streak GET request failed:', error)
       }
     }
        async function completeStreakDay(personalDate, success, sharedDate = personalDate) {
        try {
          console.log('[STREAK REQUEST ACTIVE DAY]', activeDay.value)
          const response = await fetch(`${STREAKS_API_URL}/complete`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: activeUserId.value, date: sharedDate, personalDate, activeDay: activeDay.value, success }),
         })
         if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
         const data = await response.json()
           if (data.userId === activeUserId.value) {
             const expectedMilestone = data.currentStreak > 0 && data.currentStreak % 5 === 0 ? `personal-streak-${data.currentStreak}` : null
             const createdAchievement = expectedMilestone && (data.achievements || []).find(achievement => achievement.key === expectedMilestone)
             console.log('[MILESTONE] new streak after End Day', data.currentStreak)
             console.log('[MILESTONE] achievement created?', Boolean(createdAchievement), createdAchievement || null)
             console.log('[MILESTONE] pending achievements returned from API', data.achievements || [])
              streakData.value = data
             pendingAchievements.value = data.achievements || []
              state.progress.currentStreak = data.currentStreak
            state.progress.lastResultDate = data.lastResultDate
            persist()
          }
          return data
        } catch (error) {
          console.error('Streak completion request failed:', error)
          return null
        }
        }
         async function evaluateTodayStreak() {
           if (!state.budget.configured || !activeUserId.value) return null
            console.log('[STREAK REQUEST ACTIVE DAY]', activeDay.value)
            const response = await fetch(`${STREAKS_API_URL}/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               userId: activeUserId.value,
               date: activeDay.value,
            }),
          })
          if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
          const result = await response.json()
          if (result.personalBroken || result.personalRestored) await loadStreaks(activeUserId.value)
          if (result.personalBroken) {
            console.log('[STREAK BREAK]', result)
            notify(`Your ${result.personalStreakBefore}-day streak ended because you went over today's pace.`)
            ;(result.sharedBroken || []).forEach(shared => {
              const buddyName = buddies.value.find(item => item.buddyUserId === shared.buddyUserId)?.name || 'your buddy'
              window.setTimeout(() => notify(`Your shared streak with ${buddyName} ended.`), 3200)
            })
          }
          if (result.personalRestored) console.log('[STREAK RESTORE]', result)
          return result
        }
      async function loadCommunityPosts(userId = activeUserId.value) {
        communityPostsLoading.value = true
        try {
          const response = await fetch(`${COMMUNITY_API_URL}/posts?userId=${encodeURIComponent(userId)}`)
          if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
          const data = await response.json()
          if (userId === activeUserId.value) communityPosts.value = Array.isArray(data) ? data : []
        } catch (error) {
          console.error('Community posts GET request failed:', error)
          if (userId === activeUserId.value) communityPosts.value = []
        } finally {
          communityPostsLoading.value = false
        }
      }
      async function loadRelationships(userId = activeUserId.value) {
        try {
          const response = await fetch(`${COMMUNITY_API_URL}/relationships?userId=${encodeURIComponent(userId)}`)
          if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
          const data = await response.json()
          if (userId === activeUserId.value) relationshipData.value = data
        } catch (error) {
          console.error('Community relationships GET request failed:', error)
          if (userId === activeUserId.value) relationshipData.value = { friends: [], incomingRequests: [] }
        }
      }
         async function loadTransactions(requestedUserId = activeUserId.value, profileLoad = null) {
         transactionsLoading.value = true
         transactionsError.value = ''
         const requestUrl = `${TRANSACTIONS_API_URL}?userId=${encodeURIComponent(requestedUserId)}`
         console.info('[CashLing] loading transactions', { activeUserId: requestedUserId, requestUrl })
          const controller = profileLoad?.controller || new AbortController()
          const loadId = profileLoad?.loadId ?? null
         const timeoutId = window.setTimeout(() => controller.abort(), 10000)
         try {
            if (profileLoad) console.log('[TRANSACTION FETCH START]', requestedUserId, loadId)
            console.log("A fetch starting", requestedUserId)
           const response = await fetch(requestUrl, { signal: controller.signal })
           console.log("B response received", response.status)
           if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
           const data = await response.json()
           console.log("C json parsed", data.length)
           if (!Array.isArray(data)) throw new Error('The transactions response was not a list')
           console.log("D requested user", requestedUserId)
           console.log("E current active user", activeUserId.value)
            if (requestedUserId !== activeUserId.value || (profileLoad && currentProfileLoad !== profileLoad)) {
             console.warn('[CashLing] stale transactions response skipped', { requestedUserId, activeUserId: activeUserId.value })
               return { aborted: true }
           }
           console.log("F assigning transactions")
           apiTransactions.value = data
           console.log("G assigned length", apiTransactions.value.length)
           state.expenses = data.map(transaction => ({ id: transaction._id, amount: transaction.amount, category: transaction.category, description: transaction.description, date: transaction.date }))
           console.info('[CashLing] transactions loaded', { activeUserId: requestedUserId, count: data.length })
           persist()
          } catch (error) {
            if (requestedUserId !== activeUserId.value || (profileLoad && currentProfileLoad !== profileLoad)) {
              console.warn('[CashLing] stale transaction error skipped', { requestedUserId, activeUserId: activeUserId.value })
               return { aborted: true }
            }
            if (error.name === 'AbortError' && profileLoad) return { aborted: true }
            transactionsError.value = 'Unable to load transactions from the server.'
           console.error('Transaction API request failed:', error)
           return { aborted: false }
         } finally {
           window.clearTimeout(timeoutId)
           console.log("H before finally", transactionsLoading.value)
            if (requestedUserId === activeUserId.value && (!profileLoad || currentProfileLoad === profileLoad)) transactionsLoading.value = false
           console.log("I after finally", transactionsLoading.value)
        }
        }
         async function loadBudget(userId = activeUserId.value, profileLoad = null) {
         budgetError.value = ''
         const requestUrl = `${BUDGET_API_URL}?userId=${encodeURIComponent(userId)}`
         console.info('[CashLing] loading budget', { activeUserId: userId, requestUrl })
          const controller = profileLoad?.controller || new AbortController()
          const loadId = profileLoad?.loadId ?? null
          const timeoutId = window.setTimeout(() => controller.abort(), 10000)
          try {
             if (profileLoad) console.log('[BUDGET FETCH START]', userId, loadId)
             console.log("START fetch budget", requestUrl)
            const response = await fetch(requestUrl, { signal: controller.signal })
            console.log("RESPONSE received", response.status)
           if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
           const budget = await response.json()
            if (userId !== activeUserId.value || (profileLoad && currentProfileLoad !== profileLoad)) return { aborted: true }
            if (!budget) return { aborted: false }
           state.budget = {
            monthly: Number(budget.monthlyBudget),
            savings: Number(budget.protectedSavings),
            start: budget.startDate,
            end: budget.endDate,
            configured: budget.configured !== false,
           }
           console.info('[CashLing] budget loaded', { activeUserId: userId, configured: state.budget.configured })
           Object.assign(budgetForm, state.budget)
            persist()
            return { aborted: false }
          } catch (error) {
            if ((error.name === 'AbortError' && profileLoad) || (profileLoad && currentProfileLoad !== profileLoad)) return { aborted: true }
            if (userId !== activeUserId.value) return { aborted: true }
            budgetError.value = 'Unable to load budget from the server.'
            console.error('Budget GET request failed:', error)
            return { aborted: false }
          } finally {
            window.clearTimeout(timeoutId)
          }
        }
       function isCurrentProfileLoad(profileLoad) {
        return currentProfileLoad === profileLoad && activeUserId.value === profileLoad.userId && !profileLoad.controller.signal.aborted
       }
       function loadProfile(userId) {
        if (currentProfileLoad?.userId === userId && !currentProfileLoad.controller.signal.aborted) return currentProfileLoad.promise
        if (currentProfileLoad && !currentProfileLoad.controller.signal.aborted) {
          console.log('[PROFILE LOAD ABORT]', currentProfileLoad.userId, currentProfileLoad.loadId)
          currentProfileLoad.controller.abort()
        }
        const profileLoad = { userId, loadId: ++profileLoadSequence, controller: new AbortController(), promise: null }
        currentProfileLoad = profileLoad
        console.log('[PROFILE LOAD START]', userId, profileLoad.loadId)
        profileLoad.promise = (async () => {
          const [budgetResult, transactionResult] = await Promise.all([
            loadBudget(userId, profileLoad),
            loadTransactions(userId, profileLoad),
            loadStreaks(userId),
            loadCommunityPosts(userId),
            loadRelationships(userId),
          ])
          if (!isCurrentProfileLoad(profileLoad)) return
          if (budgetResult?.aborted && transactionResult?.aborted) return
          showBudgetModal.value = userId === 'user_alex' && !state.budget.configured
          if (!showBudgetModal.value) {
            initializeAllowanceAfterProfileLoad(userId)
            try { await evaluateTodayStreak() } catch (error) { console.error('Initial streak evaluation failed:', error) }
           }
           await loadStreakNotifications(userId)
             console.log('[PROFILE DATE CHECK]', {
               userId: activeUserId.value,
             activeDay: activeDay.value,
             })
         })().finally(() => {
          if (currentProfileLoad === profileLoad) {
            if (profileLoad.controller.signal.aborted) console.log('[PROFILE LOAD ABORT]', userId, profileLoad.loadId)
            else console.log('[PROFILE LOAD COMPLETE]', userId, profileLoad.loadId)
            currentProfileLoad = null
          }
        })
        return profileLoad.promise
       }
       async function selectProfile(userId) {
        const profile = profiles.find(item => item.userId === userId)
        if (!profile) return
        if (currentProfileLoad?.userId === profile.userId && !currentProfileLoad.controller.signal.aborted) return currentProfileLoad.promise
       activeUserId.value = profile.userId
       localStorage.setItem(ACTIVE_USER_STORAGE_KEY, profile.userId)
       Object.assign(state, loadState(profile.userId))
       Object.assign(budgetForm, state.budget)
         apiTransactions.value = []
          streakData.value = null
          pendingAchievements.value = []
          overviewNotifications.value = []
         communityPosts.value = []
         communityFeedExpanded.value = false
         relationshipData.value = { friends: [], incomingRequests: [] }
       transactionsError.value = ''
       budgetError.value = ''
       expenseError.value = ''
       view.value = 'overview'
       wrappedIndex.value = 0
       showForm.value = false
       showProfileSelector.value = false
       showBudgetModal.value = profile.fresh && !state.budget.configured
          await loadProfile(profile.userId)
      }
      function openProfileSelector() { showProfileSelector.value = true }
       async function loadStreakNotifications(userId = activeUserId.value) {
          console.log('[NOTIFICATIONS LOAD START]', userId)
          try {
            console.log('[STREAK REQUEST ACTIVE DAY]', activeDay.value)
            const response = await fetch(`${STREAKS_API_URL}/notifications?userId=${encodeURIComponent(userId)}`)
           if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
           const notifications = await response.json()
            console.log('[NOTIFICATIONS FETCHED]', notifications)
            if (userId === activeUserId.value) {
              overviewNotifications.value = Array.isArray(notifications) ? notifications : []
              console.log('[OVERVIEW NOTIFICATION STATE]', overviewNotifications.value)
              if (overviewNotifications.value.length) {
                notifySequence(overviewNotifications.value.map(notification => `🔥 Shared streak · ${notification.message.replace(/^🔥\s*/, '')}`))
                await Promise.all(overviewNotifications.value.map(notification => markNotificationSeen(notification._id)))
                overviewNotifications.value = []
              }
            }
         } catch (error) {
           console.error('Streak notifications GET request failed:', error)
         }
       }
         async function markNotificationSeen(notificationId) {
           try {
             console.log('[STREAK REQUEST ACTIVE DAY]', activeDay.value)
             const response = await fetch(`${STREAKS_API_URL}/notifications/${encodeURIComponent(notificationId)}/seen?userId=${encodeURIComponent(activeUserId.value)}`, { method: 'PATCH' })
            if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
            console.log('[NOTIFICATION MARKED SEEN]', notificationId)
            return true
          } catch (error) {
            console.error('Streak notification mark-seen request failed:', error)
            return false
          }
        }
     function normalizeAllowanceDate() {
       const allowanceDate = state.progress.allowanceDate
       if (allowanceDate && allowanceDate >= state.budget.start && allowanceDate <= state.budget.end) return false
       const today = dateInput(new Date())
       state.progress.allowanceDate = today < state.budget.start ? state.budget.start : today > state.budget.end ? state.budget.end : today
       state.progress.allowancePeriod = ''
       state.progress.dailyAllowance = null
       console.warn('[CashLing] reset out-of-range allowance date', { allowanceDate, normalizedDate: state.progress.allowanceDate })
       return true
     }
     function initializeAllowanceAfterProfileLoad(userId) {
       console.info('[CashLing] allowance inputs after budget and transactions loaded', {
         userId,
         dailyAllowance: state.progress.dailyAllowance,
         allowanceDate: state.progress.allowanceDate,
         calculatedDailyAllowance: budgetMetrics.value.calculatedDailyAllowance,
         remainingSpendable: budgetMetrics.value.remainingSpendable,
         remainingDays: budgetMetrics.value.remainingDays,
         currentPeriodSpending: budgetMetrics.value.currentPeriodSpending,
         financialStatus: financialStatus.value,
       })
       normalizeAllowanceDate()
       if (state.progress.dailyAllowance === 0 && budgetMetrics.value.calculatedDailyAllowance > 0 && financialStatus.value === 'on-track') {
         console.warn('[CashLing] invalidating stale saved $0 daily allowance', { userId })
         state.progress.allowanceDate = ''
         state.progress.allowancePeriod = ''
         state.progress.dailyAllowance = null
       }
        ensureDailyAllowance()
       console.info('[CashLing] allowance initialized', {
         userId,
         allowanceDate: state.progress.allowanceDate,
         remainingDays: budgetMetrics.value.remainingDays,
         calculatedDailyAllowance: budgetMetrics.value.calculatedDailyAllowance,
         dailyAllowance: state.progress.dailyAllowance,
         displayedSafeToSpend: budgetMetrics.value.safeToday,
       })
     }
      function ensureDailyAllowance() {
       if (!state.budget.configured) return
       if (dateInput(new Date()) > state.budget.end) {
         state.progress.allowanceDate = state.budget.end
         state.progress.allowancePeriod = periodKey(state.budget)
         state.progress.dailyAllowance = 0
         persist()
         return
       }
        if (state.progress.allowanceDate === activeDay.value && state.progress.allowancePeriod === periodKey(state.budget) && state.progress.dailyAllowance !== null && Number.isFinite(Number(state.progress.dailyAllowance))) return
       state.progress.allowanceDate = activeDay.value
       state.progress.allowancePeriod = periodKey(state.budget)
       state.progress.dailyAllowance = budgetMetrics.value.calculatedDailyAllowance
      persist()
    }
     function settleDay(date, allowance, successOverride = null) {
      if (date < state.budget.start || date > state.budget.end || state.progress.dailyRecords.some(record => record.date === date)) return null
      const totalSpent = expenseTotalsByDate.value[date] || 0
       const success = successOverride === null ? Number(totalSpent) <= Math.max(0, allowance) : successOverride
      state.progress.dailyRecords.push({ date, totalSpent: Number(totalSpent), safeLimit: Math.max(0, allowance), status: success ? 'success' : 'overspent' })
      return { date, success }
    }
      async function endDay() {
       if (!state.budget.configured) return
        ensureDailyAllowance()
        const beforeActiveDay = activeDay.value
        const endedDay = activeDay.value
        console.log('[ACTIVE DAY BEFORE END]', beforeActiveDay)
        console.log('[ENDED DAY]', endedDay)
      const safeLimit = budgetMetrics.value.safeToday
      const totalSpent = budgetMetrics.value.todaySpending
        const result = { success: totalSpent <= safeLimit && financialStatus.value === 'on-track' }
       console.log('[MILESTONE] current streak before End Day', streakData.value?.currentStreak ?? 0)
       settleDay(endedDay, safeLimit, result.success)
           const streakResult = await completeStreakDay(endedDay, result.success, endedDay)
           const nextDay = addDays(endedDay, 1)
           state.progress.allowanceDate = nextDay > state.budget.end ? state.budget.end : nextDay
           state.progress.allowancePeriod = periodKey(state.budget)
           state.progress.dailyAllowance = null
          state.progress.dailyAllowance = nextDay > state.budget.end ? 0 : budgetMetrics.value.calculatedDailyAllowance
           console.log('[ACTIVE DAY AFTER ADVANCE]', activeDay.value)
           console.log('[END DAY]', {
             endedDay,
             beforeActiveDay,
             afterActiveDay: activeDay.value,
           })
           persist()
          if (streakResult) {
            await loadStreaks(activeUserId.value)
            await loadStreakNotifications(activeUserId.value)
          }
         expenseDate.value = activeDay.value
       persist()
       if (!streakResult) {
         notify(result.success ? 'Day complete ✓ · You stayed within today’s pace.' : `Day complete · You were ${money(Math.max(0, totalSpent - safeLimit))} over today’s pace.`)
         return
       }
       const personalSuccess = streakResult.personal?.success ?? result.success
       const updatedPersonalStreak = streakResult.personal?.currentStreak ?? streakResult.currentStreak ?? state.progress.currentStreak
         const messages = [personalSuccess
           ? `🔥 Personal streak · Your personal streak is now ${updatedPersonalStreak} days.`
           : streakResult.personal?.brokenBeforeFinalize ? null : '🔥 Personal streak · Your streak ended. Start again tomorrow.']
        ;(streakResult.sharedResults || []).forEach(shared => {
         if (shared.outcome === 'success') messages.push(shared.sharedStreak % 5 === 0
            ? `🔥 Shared streak · You and ${shared.buddyName} reached a ${shared.sharedStreak}-day shared streak!`
            : `🔥 Shared streak · You and ${shared.buddyName} kept your shared streak going! Shared streak: ${shared.sharedStreak} days.`)
          else if (shared.outcome === 'failure') messages.push(`🔥 Shared streak · Your shared streak with ${shared.buddyName} ended. Start again tomorrow.`)
        })
        notifySequence(messages)
     }
    function presentationExpenses() {
      const week = completedWeek.value.start
      const previous = previousWeek.value.start
      return [
        ['p1', 18.4, 'Food & drink', 'Coffee & breakfast', week, 0], ['p2', 12.6, 'Transport', 'Bus + train', week, 1], ['p3', 24.2, 'Food & drink', 'Lunch', week, 2], ['p4', 8.9, 'Fun', 'Cinema snack', week, 3], ['p5', 42.5, 'Shopping', 'Studio supplies', week, 5], ['p6', 16.8, 'Food & drink', 'Dinner out', week, 6],
        ['q1', 26, 'Food & drink', 'Previous week lunch', previous, 1], ['q2', 30, 'Shopping', 'Previous week shop', previous, 3], ['q3', 32, 'Fun', 'Previous week plans', previous, 5], ['q4', 20, 'Transport', 'Previous week travel', previous, 6],
      ].map(([id, value, type, note, start, offset]) => ({ id: `demo-${id}`, amount: value, category: type, description: note, date: addDays(start, offset) }))
    }
    function seedDemoFinance() {
      const today = new Date(); const start = dateInput(new Date(today.getFullYear(), today.getMonth(), 1)); const end = dateInput(new Date(today.getFullYear(), today.getMonth() + 1, 0))
      state.budget = { monthly: 900, savings: 160, start, end, configured: true }
      state.expenses = [...state.expenses.filter(expense => !String(expense.id).startsWith('demo-')), ...presentationExpenses()]
       state.progress = { dailyRecords: [...Array.from({ length: 5 }, (_, index) => ({ date: addDays(completedWeek.value.start, index), totalSpent: 12, safeLimit: 24, status: 'success' })), { date: dateInput(new Date()), totalSpent: 0, safeLimit: 24, status: 'success' }], weeklyPointsAwarded: [], allowanceDate: dateInput(new Date()), allowancePeriod: periodKey(state.budget), dailyAllowance: 24 }
      Object.assign(budgetForm, state.budget)
    }
    function loadPresentationDemo() {
      seedDemoFinance()
       state.community = { friends: [{ username: 'chloe123', name: 'Chloe', initials: 'C', savingsProgress: 75 }, { username: 'sarah456', name: 'Sarah', initials: 'S', improvement: 12 }], friendRequests: [], buddy: { username: 'chloe123', name: 'Chloe', invited: true, accepted: true, sharedStreak: 5, friendStatus: 'approaching', userUsage: 62, friendUsage: 84, lastNudge: null }, availableWin: '', shareDecisions: {}, incomingNudge: true, demoOpen: true }
      state.demo = { active: true, scenario: 3, completed: [true, true, true] }; demoMode.value = true; showBudgetModal.value = false; wrappedIndex.value = 0; persist(); notify('Chloe nudged you 👋 · Keep today\'s pace going to protect your streak.')
    }
    function runScenario1() { const clean = initialState(); state.budget = { ...clean.budget, monthly: 900, savings: 160, configured: true }; state.expenses = []; state.progress = clean.progress; state.community = clean.community; state.demo = { active: true, scenario: 1, completed: [false, false, false] }; Object.assign(budgetForm, state.budget); demoMode.value = true; showBudgetModal.value = false; persist(); notify('Scenario 1 ready · log an expense through the normal UI') }
     function runScenario2() { seedDemoFinance(); state.community = { ...initialState().community, demoOpen: true }; state.demo = { active: true, scenario: 2, completed: [true, true, false] }; demoMode.value = true; showBudgetModal.value = false; wrappedIndex.value = 0; persist(); notify('Scenario 2 ready · open Insights') }
    function runScenario3() { loadPresentationDemo() }
    function resetDemoData() { const clean = initialState(); state.budget = clean.budget; state.expenses = clean.expenses; state.progress = clean.progress; state.community = clean.community; state.demo = clean.demo; Object.assign(budgetForm, state.budget); demoMode.value = false; showBudgetModal.value = true; persist(); notify('Demo reset · Scenario 1 is ready to start') }
     async function saveBudget() {
       if (!budgetForm.monthly || budgetForm.monthly < 0 || budgetForm.savings < 0 || !budgetForm.start || !budgetForm.end || budgetForm.end < budgetForm.start) return
       try {
         const response = await fetch(BUDGET_API_URL, {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
              userId: activeUserId.value,
             monthlyBudget: Number(budgetForm.monthly),
             protectedSavings: Number(budgetForm.savings),
             startDate: budgetForm.start,
             endDate: budgetForm.end,
             configured: true,
           }),
         })
         if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
         const budget = await response.json()
         const changedPeriod = state.budget.configured && periodKey(state.budget) !== `${budget.startDate}:${budget.endDate}`
         state.budget = { monthly: Number(budget.monthlyBudget), savings: Number(budget.protectedSavings), start: budget.startDate, end: budget.endDate, configured: budget.configured !== false }
         if (changedPeriod) state.progress.dailyRecords = []
          state.progress.allowanceDate = ''
          state.progress.allowancePeriod = ''
          state.progress.dailyAllowance = null
         ensureDailyAllowance()
          showBudgetModal.value = false; persist(); notify('Budget plan saved')
          try { await evaluateTodayStreak() } catch (error) { console.error('Budget streak evaluation failed:', error) }
       } catch (error) {
         budgetError.value = 'Unable to save budget to the server.'
         console.error('Budget PUT request failed:', error)
         notify('Unable to save budget to the server.')
       }
    }
    function editBudget() { Object.assign(budgetForm, state.budget); showBudgetModal.value = true }
     async function addExpense() {
       const value = Number(amount.value); if (!value || value <= 0) return
       expenseSubmitting.value = true
       expenseError.value = ''
       try {
         const response = await fetch(TRANSACTIONS_API_URL, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
              userId: activeUserId.value,
             amount: value,
             category: category.value,
             description: description.value.trim() || 'Everyday spend',
             date: expenseDate.value,
           }),
         })
          if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
          const transaction = await response.json()
          const settledDay = ensureDailyAllowance()
          await loadTransactions(activeUserId.value)
           try { await evaluateTodayStreak() } catch (error) { console.error('Immediate streak evaluation failed:', error) }
         if (demoMode.value && state.demo.scenario === 1) state.demo.completed[0] = true
         amount.value = ''; description.value = ''; expenseDate.value = activeDay.value; showForm.value = false; persist()
         notify(settledDay?.success
           ? 'Expense added. Yesterday was within your daily pace.'
           : settledDay
             ? 'Expense added. Yesterday exceeded your daily pace.'
             : 'Expense added · forecasts updated')
       } catch (error) {
         expenseError.value = 'Unable to save expense to the server.'
         console.error('Transaction POST request failed:', error)
       } finally {
         expenseSubmitting.value = false
       }
     }
      async function removeExpense(id) {
       const apiTransaction = apiTransactions.value.find(item => item._id === id)
       if (apiTransaction) {
         try {
            const response = await fetch(`${TRANSACTIONS_API_URL}/${encodeURIComponent(id)}?userId=${encodeURIComponent(activeUserId.value)}`, { method: 'DELETE' })
            if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
            await loadTransactions(activeUserId.value)
         } catch (error) {
           console.error('Transaction DELETE request failed:', error)
           notify('Unable to delete expense from the server.')
           return
         }
       }
         state.expenses = state.expenses.filter(item => item.id !== id)
        try { await evaluateTodayStreak() } catch (error) { console.error('Immediate streak evaluation failed:', error) }
       persist()
        notify('Expense removed · totals updated')
      }
      async function updateExpense(id, changes) {
        const response = await fetch(`${TRANSACTIONS_API_URL}/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: activeUserId.value, ...changes }),
        })
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
        await response.json()
        await loadTransactions(activeUserId.value)
        await evaluateTodayStreak()
        persist()
        return apiTransactions.value.find(item => item._id === id)
      }
     async function sendFriendRequest() {
       const username = friendUsername.value.trim().replace(/^@/, '')
       if (!username) return
       try {
         const response = await fetch(`${COMMUNITY_API_URL}/friends/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: activeUserId.value, username }) })
         if (!response.ok) throw new Error((await response.json()).message || `Request failed with status ${response.status}`)
         friendUsername.value = ''; showAddFriend.value = false; await loadRelationships(); notify(`Friend request sent to @${username}`)
       } catch (error) {
         notify(error.message || 'Unable to send friend request')
       }
     }
     async function respondToFriendRequest(requestId, action) {
       try {
         const response = await fetch(`${COMMUNITY_API_URL}/friends/requests/${requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: activeUserId.value, action }) })
         if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
         relationshipData.value = await response.json()
         await loadCommunityPosts()
         notify(action === 'accept' ? 'Friend request accepted' : 'Friend request declined')
       } catch (error) {
         notify('Unable to update friend request')
       }
     }
    function acceptFriendDemo() { if (!state.community.friends.some(friend => friend.username === 'chloe123')) { state.community.friends.push({ username: 'chloe123', name: 'Chloe', initials: 'C', status: 'pending' }) }; state.community.friendRequests = []; persist(); notify('Chloe accepted your friend request') }
      async function shareWin(text) {
        const achievement = shareableAchievements.value.find(item => item.text === text)
        const safeText = text
        try {
          const response = await fetch(`${COMMUNITY_API_URL}/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: activeUserId.value, type: 'win', text: safeText, ...(achievement?.id ? { sourceAchievementId: achievement.id } : {}) }),
          })
          if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
           const post = await response.json()
           communityPosts.value = [post, ...communityPosts.value.filter(item => item._id !== post._id)]
          if (achievement?.id) pendingAchievements.value = pendingAchievements.value.filter(item => item._id !== achievement.id)
           state.community.shareDecisions[achievement?.key || text] = 'shared'
          state.community.availableWin = ''
          persist()
          notify('Shared a progress win · no wallet details included')
        } catch (error) {
          console.error('Community post POST request failed:', error)
          notify('Unable to share this win right now')
        }
      }
      function toggleCommunityFeed() { communityFeedExpanded.value = !communityFeedExpanded.value }
       function removeFriend(friendUserId, friendName) {
         removeFriendTarget.value = { userId: friendUserId, name: friendName }
       }
       async function confirmRemoveFriend() {
         const target = removeFriendTarget.value
         if (!target) return
         try {
           const response = await fetch(`${COMMUNITY_API_URL}/friends/${encodeURIComponent(target.userId)}?userId=${encodeURIComponent(activeUserId.value)}`, { method: 'DELETE' })
           if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
           relationshipData.value = await response.json()
           await Promise.all([loadStreaks(), loadCommunityPosts(), loadRelationships()])
           removeFriendTarget.value = null
           notify(`${target.name} was removed`)
         } catch (error) {
           notify('Unable to remove friend')
         }
       }
       async function sendStreakRequest(friendUserId, friendName) {
         try {
           console.log('[START SHARED STREAK REQUEST]', {
             currentUserId: activeUserId.value,
             friendUserId,
           })
           console.log('[STREAK REQUEST ACTIVE DAY]', activeDay.value)
           const response = await fetch(`${STREAKS_API_URL}/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: activeUserId.value, buddyUserId: friendUserId }) })
          if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.message || `Request failed with status ${response.status}`)
          }
           streakData.value = await response.json()
           await Promise.all([loadStreaks(), loadRelationships()])
           notify(`Shared streak started with ${friendName}`)
        } catch (error) {
          notify(error.message || 'Unable to send shared streak request')
        }
      }
      async function acceptStreakRequest() {
        try {
          console.log('[STREAK REQUEST ACTIVE DAY]', activeDay.value)
          const response = await fetch(`${STREAKS_API_URL}/requests/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: activeUserId.value }) })
          if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
          streakData.value = await response.json()
          notify('Shared streak started')
        } catch (error) {
          notify('Unable to accept shared streak request')
        }
      }
     async function keepPrivate(text) {
       const achievement = shareableAchievements.value.find(item => item.text === text)
       if (achievement?.id) {
         try {
           const response = await fetch(`${ACHIEVEMENTS_API_URL}/${achievement.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: activeUserId.value, status: 'private' }) })
           if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
           pendingAchievements.value = pendingAchievements.value.filter(item => item._id !== achievement.id)
         } catch (error) {
           notify('Unable to keep this win private right now')
           return
         }
       }
       state.community.shareDecisions[achievement?.key || text] = 'private'; state.community.availableWin = ''; persist(); notify('Kept this win private')
     }
    function inviteBuddy(friend) { state.community.buddy = { username: friend.username, name: friend.name, invited: true, accepted: false, sharedStreak: 0, friendStatus: 'pending', lastNudge: null }; persist(); notify(`Savings Buddy invite sent to ${friend.name}`) }
    function acceptBuddyDemo() { if (!state.community.buddy) return; state.community.buddy.accepted = true; state.community.buddy.friendStatus = 'pending'; persist(); notify(`${state.community.buddy.name} accepted your Savings Buddy invite`) }
    function simulateFriendApproaching() { if (state.community.buddy) { state.community.buddy.friendStatus = 'approaching'; state.community.buddy.friendUsage = 84; persist(); notify(`${state.community.buddy.name} is approaching today's pace`) } }
     function simulateFriendSuccess() { if (!state.community.buddy) return; state.community.buddy.friendStatus = 'on-track'; state.community.buddy.friendUsage = 62; if (currentUserStatus.value.startsWith('On track')) state.community.buddy.sharedStreak += 1; persist(); notify('Savings Buddy day completed') }
    function simulateUserSuccess() { const today = dateInput(new Date()); if (!state.progress.dailyRecords.some(record => record.date === today)) { state.progress.dailyRecords.push({ date: today, totalSpent: 0, safeLimit: safeDailySpend.value, status: 'success' }); if (state.community.buddy?.accepted && state.community.buddy.friendStatus === 'on-track') state.community.buddy.sharedStreak += 1 }; if (state.community.buddy) state.community.buddy.userUsage = 62; persist(); notify('Today was recorded within your daily pace') }
    function simulateFriendPending() { if (state.community.buddy) { state.community.buddy.friendStatus = 'pending'; state.community.buddy.friendUsage = 0; persist(); notify(`${state.community.buddy.name} is pending today`) } }
    function simulateBuddyBreak() { if (state.community.buddy) { state.community.buddy.friendStatus = 'failed'; state.community.buddy.friendUsage = 110; state.community.buddy.sharedStreak = 0; persist(); notify('Shared streak reset for the demo') } }
    function nudgeBuddy() { if (!state.community.buddy || !['approaching', 'pending'].includes(state.community.buddy.friendStatus)) return; if (nudgeSentToday.value) { notify('Nudge already sent today') ; return }; state.community.buddy.lastNudge = dateInput(new Date()); persist(); notify(`Nudge sent to ${state.community.buddy.name} 👋`) }
    function simulateBuddyNudge() { state.community.incomingNudge = true; if (state.community.buddy) state.community.buddy.userUsage = 86; persist(); notify('Chloe nudged you 👋 · Keep today\'s pace going to protect your streak.') }
    function simulateSavingsWin() { runScenario3() }
    function simulateStreakWin() { runScenario2() }
    function simulateImprovedWeek() { resetDemoData() }
     function go(next) { view.value = next; showForm.value = false; window.scrollTo({ top: 0, behavior: 'smooth' }) }
    function openExpense() { view.value = 'overview'; showForm.value = true; window.setTimeout(() => document.querySelector('.expense-form input')?.focus(), 50) }
     function nextWrap() { wrappedIndex.value = Math.min(Math.max(0, insightsCards.value.length - 1), wrappedIndex.value + 1) }
     function previousWrap() { wrappedIndex.value = Math.max(0, Math.min(insightsCards.value.length - 1, wrappedIndex.value - 1)) }
    function toggleDemoMode() { if (demoMode.value) resetDemoData(); else runScenario1() }

    watch(state, persist, { deep: true })
              onMounted(async () => { if (!activeUserId.value) return; await loadProfile(activeUserId.value) })
               return { state, profiles, activeUserId, activeProfile, showProfileSelector, selectProfile, openProfileSelector, view, wrappedIndex, demoMode, showForm, showBudgetModal, showAddFriend, removeFriendTarget, friendUsername, showDetails, toast, amount, category, description, expenseDate, budgetForm, budgetMetrics, financialStatus, todayOverage, totalSpent, spendableAmount, remainingSpendable, daysRemaining, safeDailySpend, averageDailySpend, projectedSpend, expectedLeftover, overspendAmount, riskStatus, statusClass, percentSpent, recentExpenses, categoryTotals, apiTransactions, apiCategoryTotals, transactionsLoading, transactionsError, expenseSubmitting, expenseError, formattedPeriod, completedWeek, weekTotal, previousWeekTotal, weekComparison, weeklyOnTrackDays, weeklyWrappedAvailable, wrapCards, insightTransactions, insightPeriod, insightsCards, shareableWin, friends, incomingFriendRequests, relationshipData, buddy, buddies, streakRelationships, personalStreak, currentUserStatus, streakData, overviewNotifications, buddyProfileName, buddyProfileId, buddyFriendUsage, nudgeSentToday, communityFeed, allCommunityFeed, communityFeedHasMore, communityFeedExpanded, communityPosts, communityPostsLoading, currentWeekRecords, money, formatDate, saveBudget, editBudget, endDay, addExpense, removeExpense, confirmRemoveFriend, updateExpense, sendFriendRequest, respondToFriendRequest, toggleCommunityFeed, removeFriend, sendStreakRequest, acceptStreakRequest, acceptFriendDemo, inviteBuddy, acceptBuddyDemo, simulateUserSuccess, simulateFriendApproaching, simulateFriendSuccess, simulateFriendPending, simulateBuddyBreak, nudgeBuddy, simulateBuddyNudge, simulateSavingsWin, simulateStreakWin, simulateImprovedWeek, shareWin, keepPrivate, go, openExpense, nextWrap, previousWrap, toggleDemoMode, loadPresentationDemo, resetDemoData, loadStreakNotifications, categories }
  },
  template: String.raw`
     <section v-if="!activeUserId || showProfileSelector" class="profile-landing">
       <div class="profile-landing-card">
         <p class="overline">WELCOME TO CASHLING</p>
         <h1>Welcome to CashLing</h1>
         <p class="profile-intro">Start fresh or explore how CashLing adapts with more spending history.</p>
         <div class="profile-groups">
           <div>
             <p class="profile-group-label">Start fresh</p>
             <button v-for="profile in profiles.filter(item => item.fresh)" :key="profile.userId" class="profile-choice" @click="selectProfile(profile.userId)"><span class="profile-choice-avatar">{{ profile.initials }}</span><span><strong>{{ profile.name }}</strong><small>{{ profile.description }} · {{ profile.detail }}</small></span><b>→</b></button>
           </div>
           <div>
             <p class="profile-group-label">Explore existing profiles</p>
             <button v-for="profile in profiles.filter(item => !item.fresh)" :key="profile.userId" class="profile-choice" @click="selectProfile(profile.userId)"><span class="profile-choice-avatar">{{ profile.initials }}</span><span><strong>{{ profile.name }}</strong><small>{{ profile.description }} · {{ profile.detail }}</small></span><b>→</b></button>
           </div>
         </div>
         <button v-if="activeUserId" class="profile-cancel" @click="showProfileSelector = false">Back to {{ activeProfile.name }}</button>
       </div>
     </section>
     <div v-else class="app-shell">
        <aside class="sidebar"><div class="brand"><span class="brand-mark">$</span><span>cashling</span></div><nav class="nav"><button class="nav-item" :class="{ active: view === 'overview' }" @click="go('overview')"><span>⌂</span> Overview</button><button class="nav-item" :class="{ active: view === 'spending' }" @click="go('spending')"><span>↗</span> Spending</button><button class="nav-item" :class="{ active: view === 'wrapped' }" @click="go('wrapped')"><span>✦</span> Insights</button><button class="nav-item" :class="{ active: view === 'community' }" @click="go('community')"><span>◎</span> Community</button><button class="nav-item" :class="{ active: view === 'goals' }" @click="go('goals')"><span>◒</span> Goals</button></nav><div class="sidebar-bottom"><div class="mini-guide"><span class="guide-spark">✦</span><strong>Small steps,<br>big calm.</strong><p>Your spending story gets clearer over time.</p></div><button class="nav-item" :class="{ active: view === 'settings' }" @click="go('settings')"><span>⚙</span> Settings</button><div class="profile"><div class="profile-avatar">{{ activeProfile.initials }}</div><div><strong>{{ activeProfile.name }}</strong><small>Personal plan</small></div><button class="switch-profile-button" @click="openProfileSelector">Switch profile</button></div></div></aside>
         <main class="main-content"><header class="topbar"><div><p class="overline">{{ view === 'overview' ? 'YOUR MONEY, YOUR PACE' : view === 'wrapped' ? 'YOUR SPENDING PATTERNS' : view.toUpperCase() }}</p><h1>{{ view === 'overview' ? 'Good morning, ' + activeProfile.name : view === 'spending' ? 'Your spending' : view === 'wrapped' ? 'Insights' : view === 'community' ? 'Community' : view === 'goals' ? 'Savings goals' : 'Your settings' }} <span>✦</span></h1></div></header>
         <section v-if="view === 'overview'" class="content-grid"><div class="dashboard-column">
           <section class="safe-card"><div><div class="card-kicker"><span class="pulse-dot"></span> YOUR DAILY PACE</div><h2>Safe to spend<br><em>today</em></h2><div class="safe-amount">{{ money(safeDailySpend) }}</div></div><div class="safe-orbit"><div class="orbit-dot"></div><div class="orbit-label">clear<br>and calm</div></div><div class="safe-plan"><span>Monthly budget <b>{{ money(budgetMetrics.monthlyBudget) }}</b></span><span>Protected savings <b>{{ money(budgetMetrics.savingsGoal) }}</b></span></div></section>
            <section class="stats-grid"><div class="stat-card"><div class="stat-icon coral">$</div><span>Monthly budget</span><strong>{{ money(budgetMetrics.monthlyBudget) }}</strong><small>Your spending plan</small></div><div class="stat-card"><div class="stat-icon gold">♧</div><span>Protected savings</span><strong>{{ money(budgetMetrics.savingsGoal) }}</strong><small>Protected first</small></div><div class="stat-card streak-stat-card"><div class="stat-icon streak-icon">🔥</div><span>On-track streak</span><strong>{{ streakData?.currentStreak ?? 0 }} days</strong><small>{{ (streakData?.currentStreak ?? 0) > 0 ? 'Keep within today’s pace to continue it.' : 'Start your streak by staying within today’s pace.' }}</small></div></section>
            <section class="section-heading"><div><p class="overline">TODAY’S PACE</p><h2>How today is tracking</h2></div><button class="submit-button" @click="endDay">End Day</button></section><section class="tracking-card"><div class="tracking-header"><div><span class="status-pill" :class="{ 'at-risk': todayOverage > 0, 'on-track': todayOverage === 0 }"><i></i>{{ todayOverage > 0 ? 'OVER TODAY’S PACE' : 'ON TRACK TODAY' }}</span><p v-if="todayOverage === 0">Your spending is within today’s safe amount.</p><p v-else-if="financialStatus === 'on-track'">You're over today's pace, but still within your monthly spending plan.</p><p v-else-if="financialStatus === 'savings-breached'">You're over today's pace and have started dipping into your protected savings.</p><p v-else>You're over today's pace and have exceeded your monthly budget. There is no remaining safe-to-spend allowance for this budget period. You can still log expenses normally.</p></div><strong>{{ safeDailySpend === 0 && budgetMetrics.todaySpending > 0 ? 'Over limit' : Math.round(budgetMetrics.dailyProgressPercent) + '%' }}</strong></div><div class="budget-bar"><i :style="{ width: Math.min(100, Math.max(0, budgetMetrics.dailyProgressPercent)) + '%' }"></i></div><div class="detail-copy">Today’s spending: <b>{{ money(budgetMetrics.todaySpending) }}</b> of <b>{{ money(safeDailySpend) }}</b> safe to spend</div></section><section class="financial-status-card" :class="financialStatus"><span class="status-pill" :class="financialStatus"><i></i>{{ financialStatus === 'on-track' ? 'ON TRACK' : financialStatus === 'savings-breached' ? 'PROTECTED SAVINGS BREACHED' : 'MONTHLY BUDGET EXCEEDED' }}</span><p v-if="financialStatus === 'on-track'">You have {{ money(remainingSpendable) }} left in your spendable budget.</p><p v-else-if="financialStatus === 'savings-breached'">You've started dipping into your protected savings. You have used {{ money(budgetMetrics.savingsUsed) }} of your protected savings.</p><p v-else>You've exceeded your monthly budget. Today's safe-to-spend amount is $0, but you can still log expenses to keep your spending record accurate. Monthly overspend: {{ money(budgetMetrics.budgetOverspend) }}.</p></section>
            <section class="section-heading activity-heading"><div><p class="overline">RECENT ACTIVITY</p><h2>Your latest spends</h2></div><button class="add-button" @click="openExpense">+ Log expense</button></section><section v-if="showForm" class="expense-form"><div class="form-title"><div class="form-badge">✦</div><div><h3>Log a little spend</h3><p>It only takes a second.</p></div><button class="close-button" @click="showForm = false">×</button></div><form @submit.prevent="addExpense"><label>Amount <div class="amount-input"><span>$</span><input v-model="amount" type="number" step="0.01" min="0.01" required></div></label><label>Category<select v-model="category"><option v-for="item in categories" :key="item">{{ item }}</option></select></label><label>Date<input v-model="expenseDate" type="date" required></label><label>Description <input v-model="description" placeholder="What was it for? (optional)"></label><p v-if="expenseError" class="empty-state">{{ expenseError }}</p><button class="submit-button" type="submit" :disabled="expenseSubmitting">{{ expenseSubmitting ? 'Saving...' : 'Add expense' }} <span>→</span></button></form></section><section class="activity-list"><div v-if="!recentExpenses.length" class="empty-state">Your first expense will appear here.</div><div v-for="expense in recentExpenses" :key="expense.id" class="activity-row"><div class="activity-icon">{{ expense.category === 'Food & drink' ? '✦' : '□' }}</div><div class="activity-name"><strong>{{ expense.description }}</strong><span>{{ expense.category }} · {{ formatDate(expense.date) }}</span></div><b>-{{ money(expense.amount) }}</b></div></section><button v-if="state.expenses.length" class="text-button all-spending" @click="go('spending')">View all spending <span>→</span></button>
           <section class="wrapped-preview"><div><p class="overline">YOUR SPENDING PATTERNS</p><h2>{{ insightTransactions.length >= 5 ? 'Your Spending Insights are ready.' : 'Your Spending Insights are taking shape.' }}</h2><p>{{ insightTransactions.length >= 5 ? insightPeriod.label + '.' : 'Keep logging your spending so CashLing can spot useful patterns.' }}</p></div><div class="wrapped-preview-actions"><button class="submit-button" @click="go('wrapped')">View Insights <span>→</span></button></div></section>
        </div></section>
         <section v-else-if="view === 'wrapped'" class="wrapped-page"><div v-if="insightTransactions.length < 5" class="empty-panel"><div class="wrapped-mark">✦</div><h2>Keep logging your spending.</h2><p>We need a little more history before CashLing can spot useful patterns.</p><button class="submit-button" @click="go('overview')">Log an expense <span>→</span></button></div><div v-else class="wrapped-story"><p class="insights-period">{{ insightPeriod.label }}</p><div class="wrapped-progress"><span v-for="(card, index) in insightsCards" :key="card.label" :class="{ active: index === wrappedIndex }"></span></div><article class="wrapped-card" :class="insightsCards[wrappedIndex].tone"><p class="overline">{{ insightsCards[wrappedIndex].label }}</p><h2>{{ insightsCards[wrappedIndex].title }}</h2><p>{{ insightsCards[wrappedIndex].body }}</p><div v-if="insightsCards[wrappedIndex].progress" class="insight-progress"><i :style="{ width: insightsCards[wrappedIndex].progress + '%' }"></i></div><small>{{ insightPeriod.start && insightPeriod.end ? formatDate(insightPeriod.start) + ' – ' + formatDate(insightPeriod.end) : insightPeriod.label }}</small></article><div class="wrapped-actions"><button class="back-button" @click="previousWrap" :disabled="wrappedIndex === 0">← Previous</button><button class="submit-button" @click="nextWrap" :disabled="wrappedIndex === insightsCards.length - 1">{{ wrappedIndex === insightsCards.length - 1 ? 'Insights complete' : 'Next insight' }} <span>→</span></button></div><button class="share-win" @click="shareWin(insightsCards[wrappedIndex].title)">Share this insight</button></div></section>
        <section v-else-if="view === 'community'" class="community-page"><section class="privacy-note-card"><span>◎</span><div><strong>CashLing shares wins, not your wallet.</strong><p>Friends see streaks, percentages, and achievements, never your private amounts.</p></div><button class="add-button" @click="showAddFriend = true">+ Add Friend</button></section><section v-if="shareableWin" class="share-win-card"><div><p class="overline">A WIN WORTH SHARING</p><strong>You {{ shareableWin }}</strong></div><button class="submit-button" @click="shareWin(shareableWin)">Share this win</button></section><div class="community-grid"><section class="panel-card"><div class="section-heading compact"><div><p class="overline">SHARED WINS</p><h2>Small wins, shared</h2></div></div><div v-if="!communityFeed.length" class="empty-state">Budgeting works solo too. Add a friend when you want someone to keep you accountable.</div><div v-for="post in communityFeed" :key="post.name + post.text" class="community-post"><div class="community-avatar">{{ post.initials }}</div><p><strong>{{ post.name }}</strong> {{ post.text }} <span>{{ post.icon }}</span></p></div></section><section class="panel-card"><p class="overline">SAVINGS BUDDIES</p><h2>Keep each other on track</h2><div v-if="!friends.length" class="empty-state">Add a friend to start a private accountability streak.</div><div v-for="friend in friends" :key="friend.username" class="friend-row"><div class="community-avatar">{{ friend.initials }}</div><div><strong>{{ friend.name }}</strong><small>@{{ friend.username }} · {{ friend.points || 180 }} points</small></div><button v-if="!buddy" class="challenge-button" @click="inviteBuddy(friend)">Invite</button></div><div v-if="buddy" class="buddy-card"><strong>You + {{ buddy.name }}</strong><b>🔥 {{ buddy.sharedStreak }}-day shared streak</b><p>You: <span class="status-ok">{{ currentUserStatus }} ✅</span><br>{{ buddy.name }}: <span :class="buddy.friendStatus === 'on-track' ? 'status-ok' : buddy.friendStatus === 'failed' ? 'status-fail' : 'status-pending'">{{ buddy.friendStatus === 'on-track' ? 'On track ✅' : buddy.friendStatus === 'failed' ? 'Failed' : 'Pending ⏳' }}</span></p><button v-if="buddy.accepted && buddy.friendStatus === 'pending'" class="challenge-button" @click="nudgeBuddy">Nudge {{ buddy.name }} 👋</button></div></section></div></section>
        <section v-else class="page-panel"><div class="section-heading"><div><p class="overline">{{ view === 'spending' ? 'ALL TRANSACTIONS' : view === 'goals' ? 'YOUR TARGET' : 'PLAN CONTROLS' }}</p><h2>{{ view === 'spending' ? 'Spending history' : view === 'goals' ? 'Make your savings goal visible' : 'Edit your budget plan' }}</h2></div><button v-if="view === 'settings'" class="add-button" @click="editBudget">Edit budget</button></div><div v-if="view === 'spending'" class="panel-card"><div class="category-breakdown"><div v-for="item in categoryTotals" :key="item.name"><span>{{ item.name }}</span><b>{{ money(item.total) }}</b></div><p v-if="!categoryTotals.length" class="empty-state">No expenses logged yet.</p></div><div v-for="expense in state.expenses" :key="expense.id" class="transaction-row"><div><strong>{{ expense.description }}</strong><span>{{ expense.category }} · {{ formatDate(expense.date) }}</span></div><b>{{ money(expense.amount) }}</b><button class="delete-button" @click="removeExpense(expense.id)">Remove</button></div></div><div v-else-if="view === 'goals'" class="panel-card goal-panel"><p class="tiny-label">SAVINGS TARGET</p><strong class="big-panel-number">{{ money(state.budget.savings) }}</strong><p>Expected leftover after spending: {{ money(expectedLeftover) }}</p><div class="goal-progress"><i :style="{ width: Math.max(0, Math.min(100, expectedLeftover / Math.max(1, state.budget.savings) * 100)) + '%' }"></i></div><h3>{{ expectedLeftover >= 0 ? 'On track to protect your savings goal' : 'Goal needs attention' }}</h3><p>Keep your spending pace aligned with your personal savings goal.</p><button class="submit-button" @click="editBudget">Edit savings goal <span>→</span></button></div><div v-else class="panel-card settings-panel"><div><p class="tiny-label">CURRENT BUDGET</p><h3>{{ money(state.budget.monthly) }} monthly · {{ money(state.budget.savings) }} savings goal</h3><p>{{ formattedPeriod }}</p></div><button class="submit-button" @click="editBudget">Edit budget details <span>→</span></button></div></section>
        <section v-if="view === 'community' && buddy" class="buddy-inline"><p class="overline">SAVINGS BUDDY</p><h3>You + {{ buddy.name }}</h3><strong>🔥 {{ buddy.sharedStreak }}-day shared streak</strong><p>You <span class="status-ok">✅ On track</span> · {{ buddy.name }} <span :class="buddy.friendStatus === 'on-track' ? 'status-ok' : buddy.friendStatus === 'approaching' ? 'status-approaching' : buddy.friendStatus === 'failed' ? 'status-fail' : 'status-pending'">{{ buddy.friendStatus === 'on-track' ? '✅ On track' : buddy.friendStatus === 'approaching' ? '💜 Could use a nudge' : buddy.friendStatus === 'failed' ? '❌ Day missed / streak broken' : '⏳ Pending' }}</span></p><button v-if="buddy.friendStatus === 'approaching'" class="challenge-button" :disabled="nudgeSentToday" @click="nudgeBuddy">{{ nudgeSentToday ? 'Nudge sent ✓' : 'Nudge ' + buddy.name + ' 👋' }}</button></section><section v-if="view === 'settings'" class="social-demo"><button class="demo-toggle" @click="state.community.demoOpen = !state.community.demoOpen">Developer Demo Mode <span>{{ state.community.demoOpen ? '−' : '+' }}</span></button><div v-if="state.community.demoOpen" class="demo-actions"><button @click="toggleDemoMode">{{ demoMode ? 'Reset presentation demo' : 'Load presentation demo data' }}</button><button @click="simulateStreakWin">Simulate 7-day streak</button><button @click="simulateSavingsWin">Simulate 75% savings goal</button><button @click="simulateImprovedWeek">Simulate improved week</button><button @click="acceptFriendDemo">Simulate friend accepted</button><button @click="acceptBuddyDemo">Simulate buddy accepted</button><button @click="simulateUserSuccess">Simulate my success</button><button @click="simulateFriendApproaching">Simulate Chloe approaching pace</button><button @click="simulateFriendSuccess">Simulate Chloe success</button><button @click="simulateFriendPending">Simulate Chloe pending</button><button @click="simulateBuddyBreak">Simulate Chloe breaks streak</button><button @click="simulateBuddyNudge">Simulate Chloe nudges me</button></div></section><div v-if="view === 'community' && shareableWin" class="private-win-action"><button class="keep-private" @click="keepPrivate(shareableWin)">Keep this win private</button></div><div v-if="toast" class="toast">✓ {{ toast }}</div>
         <section v-if="view === 'community' && buddy" class="buddy-inline-refined"><p class="overline">SAVINGS BUDDY · TODAY'S PACE</p><h3>You + {{ buddy.name }}</h3><strong>🔥 {{ buddy.sharedStreak }}-day shared streak</strong><p class="buddy-explainer">Private percentages only. Nobody sees the other's spending or safe amount.</p><div class="pace-row"><div><span>You</span><i><b :style="{ width: Math.min(100, budgetMetrics.dailyProgressPercent) + '%' }"></b></i><small>{{ Math.round(budgetMetrics.dailyProgressPercent) }}% · ✅ On track</small></div><div><span>{{ buddy.name }}</span><i><b :style="{ width: Math.min(100, buddyFriendUsage) + '%' }"></b></i><small>{{ Math.round(buddyFriendUsage) }}% · {{ buddy.friendStatus === 'on-track' ? '✅ On track' : buddy.friendStatus === 'approaching' ? '💜 Could use a nudge' : buddy.friendStatus === 'failed' ? '❌ Day missed / streak broken' : '⏳ Pending' }}</small></div></div><p v-if="buddy.friendStatus === 'approaching'" class="nudge-reason">{{ buddy.name }} is getting close to today's spending pace.<br>Want to give your Savings Buddy a little encouragement?</p><button v-if="buddy.friendStatus === 'approaching'" class="challenge-button" :disabled="nudgeSentToday" @click="nudgeBuddy">{{ nudgeSentToday ? 'Nudge sent ✓' : 'Nudge ' + buddy.name + ' 👋' }}</button></section>
           <section v-if="view === 'spending'" class="spending-api-panel page-panel"><div class="section-heading"><div><p class="overline">ALL TRANSACTIONS</p><h2>Spending history</h2></div></div><div class="panel-card"><div v-if="transactionsLoading" class="empty-state">Loading transactions...</div><div v-else-if="transactionsError" class="empty-state">{{ transactionsError }}</div><div v-else><div class="category-breakdown"><div v-for="item in apiCategoryTotals" :key="item.name"><span>{{ item.name }}</span><b>{{ money(item.total) }}</b></div><p v-if="!apiCategoryTotals.length" class="empty-state">No expenses logged yet.</p></div><div v-for="expense in apiTransactions" :key="expense._id || expense.id" class="transaction-row"><div><strong>{{ expense.description }}</strong><span>{{ expense.category }} · {{ formatDate(expense.date) }}</span></div><b>{{ money(expense.amount) }}</b><button class="delete-button" @click="removeExpense(expense._id || expense.id)">Remove</button></div></div></div></section><section v-if="view === 'community' && !shareableWin" class="share-win-card shareable-achievement-card"><div><p class="overline">A WIN WORTH SHARING</p><p class="empty-state">No new win to share yet. Keep logging your small wins.</p></div></section>
          <section v-if="view === 'community' && shareableWin" class="share-win-card shareable-achievement-card"><div><p class="overline">A WIN WORTH SHARING</p><strong>{{ shareableWin }}</strong></div><div class="share-win-actions"><button class="submit-button" @click="shareWin(shareableWin)">Share this win</button><button class="keep-private" @click="keepPrivate(shareableWin)">Keep this win private</button></div></section><section v-if="view === 'community' && incomingFriendRequests.length" class="friend-requests-card"><p class="overline">FRIEND REQUESTS</p><div v-for="request in incomingFriendRequests" :key="request.id" class="friend-request-row"><strong>{{ request.name }}</strong><span>@{{ request.username }} wants to connect</span><button class="submit-button" @click="respondToFriendRequest(request.id, 'accept')">Accept</button><button class="keep-private" @click="respondToFriendRequest(request.id, 'decline')">Decline</button></div></section><p v-if="view === 'community'" class="overline streak-section-label">STREAKS</p><section v-if="view === 'community'" class="streak-summary"><div class="stat-card streak-stat-card"><div class="stat-icon streak-icon">🔥</div><span>On-track streak</span><strong>{{ streakData?.currentStreak ?? 0 }} days</strong><small>{{ (streakData?.currentStreak ?? 0) > 0 ? 'Keep within today’s pace to continue it.' : 'Start your streak by staying within today’s pace.' }}</small></div><div v-for="relationship in buddies" :key="relationship.userIds.join('-')" class="stat-card streak-stat-card shared-streak-card"><div class="stat-icon shared-streak-icon">🔥</div><span>Shared streak</span><strong>You + {{ relationship.name }}</strong><small>{{ relationship.sharedStreak }}-day shared streak</small></div></section><section v-if="view === 'community' && (streakData?.buddy || friends.length)" class="connected-friend-card"><div v-if="streakData?.buddy"><div class="community-avatar">{{ buddyProfileName.slice(0, 1) }}</div><div><p class="overline">CONNECTED FRIEND</p><strong>{{ buddyProfileName }}</strong><small>Savings Buddy · connected</small></div></div><div v-for="friend in friends" :key="friend.userId" class="connected-friend-entry"><div class="community-avatar">{{ friend.name.slice(0, 1) }}</div><div><p class="overline">CONNECTED FRIEND</p><strong>{{ friend.name }}</strong><small>@{{ friend.username }} · connected</small></div></div></section></main>
       <div v-if="showAddFriend" class="modal-backdrop"><form class="budget-modal" @submit.prevent="sendFriendRequest"><p class="overline">COMMUNITY</p><h2>Add a friend</h2><p>Enter your friend's username to send an invite.</p><label>Username<input v-model="friendUsername" required placeholder="@chloe123"></label><div class="purchase-actions"><button type="button" class="cancel-button" @click="showAddFriend = false">Cancel</button><button class="submit-button" type="submit">Send request</button></div></form></div><div v-if="showBudgetModal" class="modal-backdrop"><form class="budget-modal" @submit.prevent="saveBudget"><p class="overline">WELCOME TO CASHLING</p><h2>Set your personal plan</h2><p>Every forecast and daily limit starts with your numbers.</p><label>Monthly budget<input v-model.number="budgetForm.monthly" type="number" min="0.01" step="0.01" required></label><label>Monthly savings goal<input v-model.number="budgetForm.savings" type="number" min="0" step="0.01" required></label><div class="date-fields"><label>Start date<input v-model="budgetForm.start" type="date" required></label><label>End date<input v-model="budgetForm.end" type="date" required></label></div><button class="submit-button" type="submit">Save my budget <span>→</span></button></form></div>
        <section v-if="view === 'community'" class="community-actions"><button v-if="communityFeedHasMore" class="text-button" @click="toggleCommunityFeed">{{ communityFeedExpanded ? 'Show less' : 'View more' }} shared wins</button><button v-if="streakData?.buddy?.status === 'pending' && streakData.buddy.invitedBy !== activeUserId" class="submit-button" @click="acceptStreakRequest">Accept shared streak request</button><template v-for="friend in friends" :key="'streak-' + friend.userId"><button v-if="!streakData?.buddy" class="submit-button" @click="sendStreakRequest(friend.userId, friend.name)">Start shared streak with {{ friend.name }}</button></template><button v-if="streakData?.buddy" class="keep-private" @click="removeFriend(buddyProfileId, buddyProfileName)">Remove {{ buddyProfileName }} as a friend</button><template v-for="friend in friends" :key="'remove-' + friend.userId"><button class="keep-private" @click="removeFriend(friend.userId, friend.name)">Remove {{ friend.name }} as a friend</button></template></section>
       <div v-if="removeFriendTarget" class="modal-backdrop"><form class="budget-modal" @submit.prevent="confirmRemoveFriend"><p class="overline">COMMUNITY</p><h2>Remove {{ removeFriendTarget.name }} as a friend?</h2><p>You’ll no longer see each other’s Shared Wins, and any active shared streak between you will end.</p><div class="purchase-actions"><button type="button" class="cancel-button" @click="removeFriendTarget = null">Cancel</button><button class="submit-button" type="submit">Remove friend</button></div></form></div></div>`
}

createApp(App).mount('#app')
