import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const questions = [
  { category: 'Communication', icon: '💬', prompt: 'Your texting personality is closest to…', choices: ['I send a mysterious “haha”', 'I send a few thoughtful messages', 'I keep a lively back-and-forth going', 'I provide a full-time commentary track'] },
  { category: 'Communication', icon: '🎬', prompt: 'When a movie ending shocks you, you…', choices: ['I keep my thoughts to myself', 'I mention it after the credits', 'I discuss it on the way home', 'I pause everything for a full debrief'] },
  { category: 'Social energy', icon: '🪩', prompt: 'Your ultimate Saturday hangout is…', choices: ['I take a solo reset day', 'I plan a cozy one-on-one date', 'I gather a small, snack-filled crew', 'I head out for a big, lively adventure'] },
  { category: 'Social energy', icon: '👗', prompt: 'Picking an outfit for a night out feels…', choices: ['I would rather stay in', 'I feel good once I know the vibe', 'I enjoy a fun little fashion moment', 'I treat it like my personal red carpet'] },
  { category: 'Planning & spontaneity', icon: '🗓️', prompt: 'For a weekend getaway, you want…', choices: ['I want no plan. Let fate cook.', 'I want a loose idea', 'I want a rough schedule', 'I want a detailed itinerary'] },
  { category: 'Planning & spontaneity', icon: '🍰', prompt: 'At a restaurant, choosing your order is…', choices: ['I say “dealer’s choice, surprise me”', 'I narrow it down to two', 'I pick a familiar favorite', 'I research the menu beforehand'] },
  { category: 'Emotional support', icon: '🫶', prompt: 'When a friend is upset, your first instinct is to…', choices: ['I give them some space', 'I listen quietly', 'I check in and listen', 'I comfort them and help fix it'] },
  { category: 'Emotional support', icon: '🍪', prompt: 'Your best care package starts with…', choices: ['I send a silly meme or distraction', 'I bring their favorite dessert', 'I offer a heart-to-heart and a snack', 'I give practical help plus a follow-up'] },
  { category: 'Conflict style', icon: '🕊️', prompt: 'After a disagreement, you prefer to…', choices: ['I cool off before talking', 'I have a gentle chat soon', 'I address it directly', 'I resolve it right away'] },
  { category: 'Conflict style', icon: '🤝', prompt: 'Your favorite way to repair a wobble is…', choices: ['I move on quietly', 'I acknowledge it when needed', 'I talk it through properly', 'I have a full repair conversation'] },
]

const knowQuestions = [
  { prompt: 'What is {name}’s favourite colour?', priority: 5, correctTitle: 'The {actualAnswer} Era Is Well Documented', correct: '{guesser} correctly named {answerOwner}’s favourite colour: “{actualAnswer}”. This shade has officially entered the friendship canon.', incorrectTitle: 'A Colour-Based Knowledge Gap', incorrect: '{guesser} guessed “{guessedAnswer}”, but {answerOwner}’s actual favourite colour is “{actualAnswer}”. The visual era needs more research.' },
  { prompt: 'What is {name}’s favourite food or comfort meal?', priority: 5, correctTitle: 'Emergency Snack Protocol: Understood', correct: '{guesser} correctly identified “{actualAnswer}” as {answerOwner}’s comfort meal. The emergency dinner plan is ready.', incorrectTitle: 'A Major Comfort-Food Miscalculation', incorrect: '{guesser} guessed “{guessedAnswer}”, but {answerOwner}’s actual answer was “{actualAnswer}”. This friendship may need an emergency dinner meeting.' },
  { prompt: 'Would {name} rather stay home or go out on a free weekend?', priority: 3, correctTitle: 'The Weekend Forecast Was Accurate', correct: '{guesser} correctly predicted that {answerOwner} would choose “{actualAnswer}”. A powerful friendship-weather skill.', incorrectTitle: 'Weekend Plans: Unpredictable', incorrect: '{guesser} predicted “{guessedAnswer}”, but {answerOwner} chose “{actualAnswer}”. Check the vibes before making plans.' },
  { prompt: 'What is {name}’s dream holiday destination?', priority: 4, correctTitle: 'Passport Energy Detected', correct: '{guesser} correctly named “{actualAnswer}” as {answerOwner}’s dream destination. The escape-plan monologue has been heard.', incorrectTitle: 'The Holiday Research Was Incomplete', incorrect: '{guesser} guessed “{guessedAnswer}”, while {answerOwner}’s actual dream destination is “{actualAnswer}”. The travel files need updating.' },
  { prompt: 'What is {name}’s biggest pet peeve?', priority: 5, correctTitle: 'The Annoyance Manual Was Memorised', correct: '{guesser} correctly identified “{actualAnswer}” as {answerOwner}’s biggest pet peeve. The exact button not to press is now documented.', incorrectTitle: 'Pet Peeve: Still Under Investigation', incorrect: '{guesser} guessed “{guessedAnswer}”, but {answerOwner}’s real pet peeve is “{actualAnswer}”. A very specific annoyance remains unlocked.' },
  { prompt: 'What is one phrase or word {name} says way too often?', priority: 5, correctTitle: 'Catchphrase Ownership Confirmed', correct: '{guesser} correctly remembered “{actualAnswer}”, {answerOwner}’s recurring contribution to the friendship soundtrack.', incorrectTitle: 'The Catchphrase Was Not Catching', incorrect: '{guesser} guessed “{guessedAnswer}”, but {answerOwner}’s signature phrase is actually “{actualAnswer}”. More observational research may be needed.' },
  { prompt: 'What is {name} most likely to spend unnecessary money on?', priority: 4, correctTitle: 'A Financial Pattern Was Spotted', correct: '{guesser} correctly identified “{actualAnswer}” as {answerOwner}’s lovable spending weakness. The evidence is compelling.', incorrectTitle: 'Spending Habits: Surprisingly Mysterious', incorrect: '{guesser} guessed “{guessedAnswer}”, but {answerOwner} spends on “{actualAnswer}”. The impulse-purchase ecosystem remains mysterious.' },
  { prompt: 'Name the person {name} crushed on the hardest.', priority: 5, correctTitle: 'The {actualAnswer} Era Was Clearly Unforgettable', correct: '{guesser} correctly named {actualAnswer} as {answerOwner}’s hardest-ever crush. True love, or a storyline with enough airtime to become compulsory friendship knowledge?', incorrectTitle: 'Classified Romantic History', incorrect: '{guesser} guessed “{guessedAnswer}”, but {answerOwner}’s actual answer was “{actualAnswer}”. Apparently this chapter needs a friendship debrief.' },
  { prompt: 'What is one person, event or topic {name} could rant about for two hours?', priority: 5, correctTitle: 'The {actualAnswer} TED Talk', correct: '{guesser} correctly knew that {answerOwner} could rant about “{actualAnswer}” for two uninterrupted hours. Clearly, this lecture has already been delivered before.', incorrectTitle: 'Rant Topic: Not Yet Discovered', incorrect: '{guesser} guessed “{guessedAnswer}”, but {answerOwner} could rant about “{actualAnswer}” for two hours. The keynote topic remains under review.' },
  { prompt: 'What is the fastest way to annoy {name}?', priority: 5, correctTitle: 'A Very Specific Button Was Found', correct: '{guesser} correctly identified “{actualAnswer}” as the fastest way to annoy {answerOwner}. This is excellent friendship or extremely useful leverage.', incorrectTitle: 'The Button Remains Hidden', incorrect: '{guesser} guessed “{guessedAnswer}”, but the fastest way to annoy {answerOwner} is actually “{actualAnswer}”. Please use this knowledge responsibly.' },
]

const categoryDescriptions = {
  'Communication': 'how you share what is on your mind',
  'Social energy': 'how you like to spend your together-time',
  'Planning & spontaneity': 'how you navigate plans and plot twists',
  'Emotional support': 'how you give and receive a little care',
  'Conflict style': 'how you find your way back after a wobble',
}
const categories = Object.keys(categoryDescriptions)
const loadingMessages = ['Analysing your friendship chemistry…', 'Comparing planning capabilities…', 'Reviewing emotional chaos…', 'Measuring meme potential…']

function calculateResults(first, second) {
  const byCategory = categories.map(category => {
    const indexes = questions.map((q, i) => q.category === category ? i : -1).filter(i => i > -1)
    const score = indexes.reduce((sum, i) => sum + [100, 75, 40, 10][Math.abs(first[i] - second[i])], 0) / indexes.length
    return { category, score: Math.round(score) }
  })
  const strongest = [...byCategory].sort((a, b) => b.score - a.score)[0]
  const different = [...byCategory].sort((a, b) => a.score - b.score)[0]
  return { byCategory, strongest, different, overall: Math.round(byCategory.reduce((sum, item) => sum + item.score, 0) / byCategory.length) }
}

function observation(result) {
  const { strongest, different, overall } = result
  if (strongest.category === 'Emotional support' && strongest.score >= 75) return 'Your friendship is powered by support, memes and delayed replies.'
  if (different.category === 'Planning & spontaneity' && different.score <= 57) return 'One makes the plan. The other discovers the plan.'
  if (strongest.category === 'Conflict style' && strongest.score >= 75) return 'You two could turn a disagreement into a very efficient team meeting.'
  if (different.category === 'Social energy' && different.score <= 57) return 'One brings the party. The other brings the emergency exit plan.'
  if (overall >= 85) return 'Emotionally in sync, logistically questionable.'
  if (overall >= 60) return 'Different flavors, same friendship aisle.'
  return 'A delightful mix of matching energy and charmingly different settings.'
}

function predictions(result, answers) {
  const { byCategory, overall } = result
  const score = category => byCategory.find(item => item.category === category).score
  const same = (index, minimum) => answers.first[index] >= minimum && answers.second[index] >= minimum
  const planGap = Math.abs(answers.first[4] - answers.second[4]) >= 2 || Math.abs(answers.first[5] - answers.second[5]) >= 2

  const forecast = {
    sentence: 'A friendship with excellent snack potential and plenty of stories still to collect.',
    recurring: 'You will make a simple plan, add three side quests, and somehow end up rating the dessert menu.',
    warning: 'Different does not mean difficult: leave room for both of your friendship settings.'
  }
  if (same(4, 3) && same(5, 3)) {
    forecast.sentence = 'Two tiny project managers, united by the belief that a good time needs a spreadsheet.'
    forecast.recurring = 'You arrive early, have a backup plan, and still find one more place to visit.'
    forecast.warning = 'Try not to schedule the spontaneity out of your spontaneity.'
  } else if (answers.first[4] <= 2 && answers.second[4] <= 2 && answers.first[5] <= 2 && answers.second[5] <= 2) {
    forecast.sentence = 'Powered by vibes, last-minute messages and a heroic amount of “where should we go?”'
    forecast.recurring = 'Both of you wait for the other to choose, then enthusiastically approve the first suggestion.'
    forecast.warning = 'A backup plan may be useful when the vibes mysteriously vanish.'
  } else if (planGap) {
    forecast.sentence = 'One brings the itinerary. The other brings the plot twist.'
    forecast.recurring = 'One friend says “I have an idea” and the other is already putting on shoes.'
    forecast.warning = 'Give the planner a heads-up and the spontaneous one a little runway.'
  } else if (score('Emotional support') >= 85 && same(6, 3)) {
    forecast.sentence = 'A portable emotional support team with elite snack-delivery instincts.'
    forecast.recurring = 'One “how are you?” text becomes a two-hour debrief and an unexpectedly good plan.'
    forecast.warning = 'Remember that support can also mean listening, not just launching a rescue mission.'
  } else if (answers.first[8] <= 2 && answers.second[8] <= 2) {
    forecast.sentence = 'Conflict-avoidant sweethearts who would rather send a meme than start a difficult chat.'
    forecast.recurring = 'A tiny wobble becomes a very polite week of “no, you go first.”'
    forecast.warning = 'Name the awkward thing early; it usually shrinks once it has a name.'
  } else if (overall >= 85) {
    forecast.sentence = 'Suspiciously in sync, with matching instincts and a shared talent for side quests.'
    forecast.recurring = 'You say you will keep it quick, then accidentally create an entire day together.'
    forecast.warning = 'Your confidence is adorable. Double-check the time and meeting place anyway.'
  }
  return forecast
}

function buildHighlights(records, names) {
  const owners = [...new Set(records.map(record => record.answerOwner))]
  const selected = owners.flatMap(answerOwner => {
    const ownerRecords = records.filter(record => record.answerOwner === answerOwner)
    const matches = ownerRecords.filter(record => record.correct).sort((a, b) => b.priority - a.priority).slice(0, 2)
    const fill = ownerRecords.filter(record => !record.correct).sort((a, b) => b.priority - a.priority).slice(0, 2 - matches.length)
    return [...matches, ...fill]
  })
  if (!selected.length) return [{ title: 'New Friendship Lore Incoming', text: 'The results were less “we know everything about each other” and more “we have several important conversations to schedule.” At least the next hangout already has a topic.', type: 'fallback' }]
  return selected.map(record => {
    const values = { answerOwner: record.answerOwner, guesser: record.guesser, actualAnswer: record.realAnswer, guessedAnswer: record.guess }
    const template = record.correct ? record.question.correct : record.question.incorrect
    const fillTemplate = text => Object.entries(values).reduce((filled, [key, value]) => filled.replaceAll(`{${key}}`, value), text)
    return { title: fillTemplate(record.correct ? record.question.correctTitle : record.question.incorrectTitle), text: fillTemplate(template), type: record.correct ? 'match' : 'plot twist' }
  })
}

function App() {
  const [screen, setScreen] = useState('landing')
  const [mode, setMode] = useState('compatibility')
  const [names, setNames] = useState({ first: '', second: '' })
  const [answers, setAnswers] = useState({ first: [], second: [] })
  const [person, setPerson] = useState('first')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [results, setResults] = useState(null)
  const [loadingIndex, setLoadingIndex] = useState(0)

  useEffect(() => {
    if (screen !== 'loading') return
    const timer = setInterval(() => setLoadingIndex(i => (i + 1) % loadingMessages.length), 850)
    const finish = setTimeout(() => setScreen('results'), 3000)
    return () => { clearInterval(timer); clearTimeout(finish) }
  }, [screen])

  const begin = e => {
    e.preventDefault()
    if (names.first.trim() && names.second.trim()) {
      if (mode === 'know') setScreen('know')
      else { setPerson('first'); setQuestionIndex(0); setScreen('quiz') }
    }
  }
  const choose = value => {
    const next = [...answers[person]]
    next[questionIndex] = value
    setAnswers(prev => ({ ...prev, [person]: next }))
  }
  const nextQuestion = () => {
    if (!answers[person][questionIndex]) return
    if (questionIndex < questions.length - 1) setQuestionIndex(i => i + 1)
    else if (person === 'first') { setPerson('second'); setQuestionIndex(0); setScreen('handoff') }
    else { const computed = calculateResults(answers.first, answers.second); setResults(computed); setScreen('loading') }
  }
  const previousQuestion = () => { if (questionIndex > 0) setQuestionIndex(i => i - 1) }
  const restart = () => { setScreen('landing'); setNames({ first: '', second: '' }); setAnswers({ first: [], second: [] }); setResults(null) }

  if (screen === 'landing') return <main className="page"><Header /><section className="hero landing-card"><div className="eyebrow">Friendship Compatibility Lab <span>✦</span></div><h1>How compatible are you and your <em>bestie?</em></h1><p className="intro">A tiny quiz for two friends, one device, and the very important science of your shared chaos.</p><div className="mode-picker"><button className={mode === 'compatibility' ? 'mode-card active' : 'mode-card'} onClick={() => setMode('compatibility')}><strong>💞 Compatibility quiz</strong><span>Compare your friendship styles</span></button><button className={mode === 'know' ? 'mode-card active' : 'mode-card'} onClick={() => setMode('know')}><strong>🧠 Know your friend</strong><span>Guess how well you know each other</span></button></div><form onSubmit={begin} className="name-form"><label>Friend 1 <input required value={names.first} onChange={e => setNames({ ...names, first: e.target.value })} placeholder="Your name" maxLength="24" /></label><label>Friend 2 <input required value={names.second} onChange={e => setNames({ ...names, second: e.target.value })} placeholder="Your friend’s name" maxLength="24" /></label><button className="primary" type="submit">{mode === 'know' ? 'Start the game' : 'Start the lab'} <span>→</span></button></form><div className="privacy-note"><span>♧</span> Just for fun · Nothing is saved</div></section><div className="landing-stickers"><span>besties only</span><span>no wrong answers</span><span>✿</span></div></main>
  if (screen === 'handoff') return <main className="page"><Header /><section className="handoff-card"><div className="big-icon">✦</div><div className="eyebrow">Round one complete</div><h1>Pass the phone to<br /><em>{names.second}</em></h1><p>{names.first}’s answers are tucked away. No peeking, pinky promise.</p><button className="primary" onClick={() => setScreen('quiz')}>I’m {names.second}, let’s go <span>→</span></button><div className="dots">● ○ ○</div></section></main>
  if (screen === 'loading') return <main className="page"><Header /><section className="loading-card"><div className="loader-orbit"><span>♥</span></div><div className="eyebrow">The results are in the lab</div><h1>{loadingMessages[loadingIndex]}</h1><p>Mixing the data with a pinch of friendship magic.</p><div className="loading-bar"><i /></div></section></main>
  if (screen === 'results') return <Results names={names} result={results} observation={observation(results)} restart={restart} />
  if (screen === 'know') return <KnowGame names={names} restart={restart} />

  const q = questions[questionIndex]
  const current = answers[person][questionIndex]
  return <main className="page"><Header /><section className="quiz-shell"><div className="quiz-top"><span className="person-pill"><i>{person === 'first' ? '1' : '2'}</i> {names[person]}</span><span>{questionIndex + 1} <small>/ 10</small></span></div><div className="progress"><i style={{ width: `${((questionIndex + 1) / 10) * 100}%` }} /></div><div className="question-card"><div className="category-label">{q.icon} {q.category}</div><h1>{q.prompt}</h1><div className="choices">{q.choices.map((choice, i) => <button className={current === i + 1 ? 'choice selected' : 'choice'} key={choice} onClick={() => choose(i + 1)}><span className="choice-number">{i + 1}</span>{choice}<span className="choice-arrow">→</span></button>)}</div><div className="quiz-actions"><button className="back-button" onClick={previousQuestion} disabled={questionIndex === 0}>← Back</button><button className="primary next-button" onClick={nextQuestion} disabled={!current}>{questionIndex === questions.length - 1 ? 'See the results' : 'Next question'} <span>→</span></button></div></div><p className="quiz-hint">Choose the answer that feels most like you · Your answers stay on this device</p></section></main>
}

function Header() { return <header className="header"><div className="logo"><span>♥</span> FCL</div><div className="header-note">a little friendship science <b>✦</b></div></header> }

function KnowGame({ names, restart }) {
  const [index, setIndex] = useState(0)
  const [stage, setStage] = useState('guess')
  const [guess, setGuess] = useState('')
  const [truth, setTruth] = useState('')
  const [count, setCount] = useState(3)
  const [score, setScore] = useState({ [names.first]: 0, [names.second]: 0 })
  const [records, setRecords] = useState([])
  const [highlightIndex, setHighlightIndex] = useState(0)
  // Start with Friend 1 guessing Friend 2, then alternate who is being guessed about.
  const target = index % 2 === 0 ? names.second : names.first
  const guesser = target === names.first ? names.second : names.first
  const question = knowQuestions[index]
  const prompt = question.prompt.replace('{name}', target)
  const ownerPrompt = question.prompt.replace('{name}’s', 'your').replace('{name}', 'you')
  useEffect(() => {
    if (stage !== 'countdown') return
    if (count === 0) { setStage('reveal'); return }
    const timer = setTimeout(() => setCount(value => value - 1), 750)
    return () => clearTimeout(timer)
  }, [stage, count])
  const submitGuess = e => { e.preventDefault(); if (guess.trim()) setStage('truth') }
  const submitTruth = e => { e.preventDefault(); if (truth.trim()) { setCount(3); setStage('countdown') } }
  const mark = correct => {
    const nextScore = { ...score, [guesser]: score[guesser] + (correct ? 1 : 0) }
    const nextRecords = [...records, { answerOwner: target, realAnswer: truth, guess, guesser, correct, priority: question.priority, question }]
    setScore(nextScore)
    setRecords(nextRecords)
    if (index === knowQuestions.length - 1) { setHighlightIndex(0); setStage('highlights') }
    else { setIndex(value => value + 1); setGuess(''); setTruth(''); setStage('guess') }
  }
  const highlights = buildHighlights(records, names)
  if (stage === 'highlights') { const highlight = highlights[highlightIndex]; return <main className="page"><Header /><section className="wrapped-shell"><div className="wrapped-top"><div className="eyebrow">Bestie Wrapped <span>✦</span></div><span>{highlightIndex + 1} / {highlights.length}</span></div><div className="wrapped-card" key={highlightIndex}><span className="wrapped-type">{highlight.type === 'plot twist' ? '✦ plot twist' : '✦ highlight'}</span><div className="wrapped-sparkle">✦</div><h1>{highlight.title}</h1><p>{highlight.text}</p></div><button className="primary wrapped-next" onClick={() => highlightIndex === highlights.length - 1 ? setStage('finished') : setHighlightIndex(value => value + 1)}>{highlightIndex === highlights.length - 1 ? 'See your final score' : 'Next highlight'} <span>→</span></button></section></main> }
  if (stage === 'finished') { const correctTotal = records.filter(record => record.correct).length; const finalNote = correctTotal >= 8 ? 'A frankly impressive amount of friendship lore has been successfully archived.' : correctTotal >= 5 ? 'You know the important stuff, plus a few delightfully mysterious side quests.' : 'The results were less “we know everything” and more “we have several important conversations to schedule.”'; return <main className="page"><Header /><section className="game-finished"><div className="big-icon">🏆</div><div className="eyebrow">The friendship memory report</div><h1>How well do you know<br /><em>each other?</em></h1><div className="know-scores"><div><strong>{score[names.first]} / {knowQuestions.length / 2}</strong><span>{names.first} knows {names.second} this much</span></div><div><strong>{score[names.second]} / {knowQuestions.length / 2}</strong><span>{names.second} knows {names.first} this much</span></div></div><div className="cumulative-score"><small>CUMULATIVE SCORE</small><strong>{correctTotal} / {knowQuestions.length} <em>({Math.round(correctTotal / knowQuestions.length * 100)}%)</em></strong></div><p>{finalNote}</p><small className="total-score">{correctTotal} correct · {knowQuestions.length - correctTotal} plot twists</small><br /><button className="primary final-button" onClick={restart}>Play another round <span>→</span></button></section></main> }
  return <main className="page"><Header /><section className="quiz-shell know-shell"><div className="quiz-top"><span className="person-pill"><i>{index + 1}</i> {guesser} is guessing</span><span>{index + 1} <small>/ {knowQuestions.length}</small></span></div><div className="progress"><i style={{ width: `${((index + 1) / knowQuestions.length) * 100}%` }} /></div>{stage === 'guess' && <div className="question-card game-card"><div className="category-label">🧠 How well do you know {target}?</div><h1>{prompt}</h1><p className="game-instruction">{guesser}, type your guess. <strong>{target}</strong>, look away!</p><form onSubmit={submitGuess} className="answer-form"><input required autoFocus value={guess} onChange={e => setGuess(e.target.value)} placeholder={`Type ${guesser}’s guess…`} /><button className="primary" type="submit">Lock in guess <span>→</span></button></form></div>}{stage === 'truth' && <div className="question-card game-card"><div className="category-label">🔒 Keep the answer secret</div><h1>{ownerPrompt}</h1><p className="game-instruction">{guesser}, look away while {target} types the correct answer.</p><form onSubmit={submitTruth} className="answer-form"><input required autoFocus value={truth} onChange={e => setTruth(e.target.value)} placeholder={`Type ${target}’s answer…`} /><button className="primary" type="submit">Reveal answers <span>→</span></button></form></div>}{stage === 'countdown' && <div className="question-card countdown-card"><div className="big-icon">👀</div><div className="eyebrow">Everyone look now</div><h1>{count === 0 ? 'Reveal!' : count}</h1><p>Get ready to see how close the guess was.</p></div>}{stage === 'reveal' && <div className="question-card game-card"><div className="category-label">✨ The big reveal</div><h1>{prompt}</h1><div className="reveal-answers"><div><small>{guesser} guessed</small><strong>{guess}</strong></div><div><small>{target} says</small><strong>{truth}</strong></div></div><p className="game-instruction">Was {guesser} correct?</p><div className="judge-actions"><button className="wrong-button" onClick={() => mark(false)}>✕ Not quite</button><button className="right-button" onClick={() => mark(true)}>✓ Correct!</button></div></div>}</section></main>
}

function Results({ names, result, observation: note, restart }) {
  return <main className="page results-page"><Header /><section className="results-heading"><div className="eyebrow">The friendship report <span>✦</span></div><h1>{names.first} <span>+</span> {names.second}</h1><p>Two perspectives. One very cute data set.</p></section><section className="results-grid"><div className="score-card"><div className="score-ring"><strong>{result.overall}<small>%</small></strong><span>overall match</span></div><div className="observation"><span>✦ field note</span><p>“{note}”</p></div></div><div className="breakdown-card"><div className="card-title"><span>Compatibility breakdown</span><small>out of 100</small></div>{result.byCategory.map(item => <div className="metric" key={item.category}><div><span>{item.category}</span><b>{item.score}%</b></div><div className="metric-bar"><i style={{ width: `${item.score}%` }} /></div><small>{categoryDescriptions[item.category]}</small></div>)}</div></section><section className="match-row"><div><span className="mini-label">Strongest match</span><h2>✦ {result.strongest.category}</h2><p>You tend to see this one pretty similarly.</p></div><div><span className="mini-label">Biggest difference</span><h2>◌ {result.different.category}</h2><p>You may approach this area differently, and that’s okay.</p></div></section><button className="restart" onClick={restart}>↻ Try another pair</button></main>
}

createRoot(document.getElementById('root')).render(<App />)
