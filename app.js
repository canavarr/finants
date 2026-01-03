const app = {
    state: {
        questions: [],
        currentQuestionIndex: 0,
        userAnswers: [],
        targetEndTime: null, // Absolute timestamp
        timerInterval: null
    },

    init: function () {
        this.loadDashboardStats();
        this.checkActiveSession();

        // Reset Logic
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Kas oled kindel, et soovid ajaloo kustutada?')) {
                    localStorage.removeItem('financeExamHistory');
                    localStorage.removeItem('financeExamActiveSession'); // Also clear active session
                    location.reload();
                }
            });
        }
    },

    // --- Persistence & Session Management ---
    checkActiveSession: function () {
        const savedSession = localStorage.getItem('financeExamActiveSession');
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                // Check if time is still valid
                if (session.targetEndTime > Date.now()) {
                    const resumeBtn = document.getElementById('resumeBtn');
                    if (resumeBtn) {
                        resumeBtn.classList.remove('hidden');
                        resumeBtn.onclick = () => this.resumeExam(session);
                    }
                } else {
                    // Session expired, clear it
                    localStorage.removeItem('financeExamActiveSession');
                }
            } catch (e) {
                console.error("Error parsing session", e);
                localStorage.removeItem('financeExamActiveSession');
            }
        }
    },

    resumeExam: function (session) {
        this.state.questions = session.questions;
        this.state.currentQuestionIndex = session.currentQuestionIndex;
        this.state.userAnswers = session.userAnswers;
        this.state.targetEndTime = session.targetEndTime;

        document.getElementById('startScreen').classList.add('hidden');
        document.getElementById('resultsScreen').classList.add('hidden');
        document.getElementById('examScreen').classList.remove('hidden');

        this.startTimer();
        this.showQuestion(this.state.currentQuestionIndex);
    },

    saveExamState: function () {
        const session = {
            questions: this.state.questions,
            currentQuestionIndex: this.state.currentQuestionIndex,
            userAnswers: this.state.userAnswers,
            targetEndTime: this.state.targetEndTime
        };
        localStorage.setItem('financeExamActiveSession', JSON.stringify(session));
    },

    clearExamState: function () {
        localStorage.removeItem('financeExamActiveSession');
    },

    // --- Data Persistence (Results) ---
    saveResult: function (score, total, chapterStats, durationSeconds = 0) {
        const result = {
            date: new Date().toISOString(),
            score: score,
            total: total,
            percentage: Math.round((score / total) * 100),
            chapterStats: chapterStats,
            questionIds: this.state.userAnswers.map(ua => ua.questionId),
            durationSeconds: durationSeconds
        };

        let history = JSON.parse(localStorage.getItem('financeExamHistory') || '[]');
        history.push(result);
        localStorage.setItem('financeExamHistory', JSON.stringify(history));
    },

    loadDashboardStats: function () {
        const history = JSON.parse(localStorage.getItem('financeExamHistory') || '[]');
        if (history.length > 0) {
            const totalExams = history.length;
            const avgScore = Math.round(history.reduce((acc, curr) => acc + curr.percentage, 0) / totalExams);

            document.getElementById('totalExams').textContent = totalExams;
            document.getElementById('avgScore').textContent = avgScore + '%';
            document.getElementById('totalExams').textContent = totalExams;
            document.getElementById('avgScore').textContent = avgScore + '%';

            // Calculate Average Time
            let totalSeconds = 0;
            let timeCount = 0;
            history.forEach(h => {
                if (h.durationSeconds) {
                    totalSeconds += h.durationSeconds;
                    timeCount++;
                }
            });
            const avgSeconds = timeCount > 0 ? Math.floor(totalSeconds / timeCount) : 0;
            const avgM = Math.floor(avgSeconds / 60);
            const avgS = avgSeconds % 60;
            document.getElementById('avgTime').textContent = `${avgM}m ${avgS}s`;

            document.getElementById('dashboardPreview').classList.remove('hidden');
        }
    },

    // --- Exam Logic ---
    startExam: function () {
        // Clear any old session first if starting new
        this.clearExamState();

        this.selectQuestions();
        this.state.currentQuestionIndex = 0;
        this.state.userAnswers = [];

        // Set Start Time
        this.state.startTime = Date.now();
        // Set Absolute End Time (90 mins from now)
        this.state.targetEndTime = this.state.startTime + (90 * 60 * 1000);
        this.saveExamState();

        document.getElementById('startScreen').classList.add('hidden');
        document.getElementById('resultsScreen').classList.add('hidden');
        document.getElementById('examScreen').classList.remove('hidden');

        this.startTimer();
        this.showQuestion(0);
    },

    selectQuestions: function () {
        // 1. Get History to identifying seen questions
        const history = JSON.parse(localStorage.getItem('financeExamHistory') || '[]');
        const seenIds = new Set();
        history.forEach(session => {
            // Assume session has chapterStats but we need question level detail.
            // Wait, standard saveResult doesn't save question IDs, only stats?
            // Checking saveResult... it saves `result`.
            // We need to check if we have question level data in history.
            // app.js saveResult implementation: 
            /*
             saveResult: function (score, total, chapterStats) {
                const result = { ..., score, total, chapterStats };
                // It does NOT save the list of question IDs answered in that session.
             }
            */
            // LIMITATION: We can't know exactly which questions were answered in past sessions 
            // unless we update saveResult to store them. 
            // However, we can assume for *future* sessions we will know.
            // But for now, let's update saveResult first? 
            // Or just check if `questions` or `ids` are there.

            if (session.questionIds) {
                session.questionIds.forEach(id => seenIds.add(id));
            }
        });

        // Group by chapter
        const byChapter = {};
        for (let i = 1; i <= 14; i++) {
            byChapter[i] = ALL_QUESTIONS.filter(q => q.chapter === String(i));
        }

        const selected = [];
        const currentSessionIds = new Set(); // To avoid dupes within THIS exam

        const getWeightedPoints = (chapter) => {
            const ch = parseInt(chapter);
            if (ch <= 4) return 2.0;
            if (ch <= 9) return 2.5;
            return 3.0;
        };

        // Helper: pick one from candidates, prioritizing unseen
        const pickOne = (candidates) => {
            const unseen = candidates.filter(q => !seenIds.has(q.id) && !currentSessionIds.has(q.id));
            const pool = unseen.length > 0 ? unseen : candidates.filter(q => !currentSessionIds.has(q.id));

            if (pool.length === 0) return null; // Should not happen given data size vs 20 q

            const picked = pool[Math.floor(Math.random() * pool.length)];
            return picked;
        };

        // 1. Pick one random question from each chapter (14 total)
        for (let i = 1; i <= 14; i++) {
            const chapterQuestions = byChapter[i];
            if (chapterQuestions && chapterQuestions.length > 0) {
                const randomQ = pickOne(chapterQuestions);

                if (randomQ) {
                    // Create a copy to avoid mutating original and apply weight
                    const qCopy = { ...randomQ };
                    qCopy.points = getWeightedPoints(qCopy.chapter); // Override points

                    selected.push(qCopy);
                    currentSessionIds.add(randomQ.id);
                }
            }
        }

        // 2. Fill the remaining 6 questions randomly from any chapter
        // Pool of all valid remaining questions
        let remainingPool = ALL_QUESTIONS.filter(q => !currentSessionIds.has(q.id));

        // Split into unseen and seen for prioritization
        let unseenRest = remainingPool.filter(q => !seenIds.has(q.id));
        let seenRest = remainingPool.filter(q => seenIds.has(q.id));

        // Shuffle both
        unseenRest.sort(() => Math.random() - 0.5);
        seenRest.sort(() => Math.random() - 0.5);

        // Fill from unseen first, then seen
        const fillPool = [...unseenRest, ...seenRest];

        while (selected.length < 20 && fillPool.length > 0) {
            const extraQ = fillPool.shift();
            const qCopy = { ...extraQ };
            qCopy.points = getWeightedPoints(qCopy.chapter);
            selected.push(qCopy);
        }

        // 3. Sort the final exam by chapter (1 -> 14)
        this.state.questions = selected.sort((a, b) => {
            return parseInt(a.chapter) - parseInt(b.chapter);
        });

        console.log("Selected questions:", this.state.questions.map(q => `Ch${q.chapter} ${seenIds.has(q.id) ? '(Seen)' : '(New)'}`));
    },

    startTimer: function () {
        const timerEl = document.getElementById('timer');
        clearInterval(this.state.timerInterval);

        this.state.timerInterval = setInterval(() => {
            const now = Date.now();
            const diff = this.state.targetEndTime - now;

            if (diff <= 0) {
                timerEl.textContent = "00:00";
                this.endExam(true); // Auto-end
                return;
            }

            // Calculate formatted time
            const totalSecondsInput = Math.floor(diff / 1000);
            const minutes = Math.floor(totalSecondsInput / 60);
            const seconds = totalSecondsInput % 60;
            timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // Warnings
            timerEl.className = 'timer'; // Reset classes
            if (minutes < 1) {
                timerEl.classList.add('timer-warning-1');
            } else if (minutes < 5) {
                timerEl.classList.add('timer-warning-5');
            } else if (minutes < 10) {
                timerEl.classList.add('timer-warning-10');
            }

        }, 1000); // Update every second
    },

    showQuestion: function (index) {
        if (index >= this.state.questions.length) {
            this.endExam();
            return;
        }

        const q = this.state.questions[index];
        const container = document.getElementById('questionContainer');
        document.getElementById('currentQ').textContent = index + 1;

        // --- LMS Style Structure ---
        let html = `
            <div class="question-card">
                <div class="question-header-bar">
                    <span class="question-title">Question ${index + 1}</span>
                    <span class="question-points">${q.points} / ${q.points} pts</span>
                </div>
                <div class="question-body">
                    <!-- Standard Question Text -->
                    <div class="question-text">${q.question}</div>
        `;

        // Subquestion / Additional Context
        if (q.questionText) html += `<div class="sub-question">${q.questionText.replace(/\n/g, '<br>')}</div>`;
        if (q.subQuestion) html += `<div class="sub-question" style="color: #d63384;">${q.subQuestion}</div>`; // Using a distinct color like in screenshot if needed, or Keep blue

        // Data Renderers
        if (q.tableData) html += this.renderTable(q.tableData);
        if (q.table) html += this.renderTable(q.table); // Fix for questions using 'table' instead of 'tableData'
        if (q.sideBySideTables) html += this.renderSideBySideTables(q.sideBySideTables);
        if (q.inventoryData) html += this.renderInventoryData(q.inventoryData);
        if (q.bondDetails) html += this.renderBondDetails(q.bondDetails);
        if (q.bondPriceInfo) html += this.renderBondPriceInfo(q.bondPriceInfo);
        if (q.equityStatement) html += this.renderEquityStatement(q.equityStatement);
        if (q.additionalInfo) html += this.renderAdditionalInfo(q.additionalInfo);
        if (q.timeline) html += this.renderTimeline(q.timeline);
        if (q.note) html += `<div style="font-size: 0.9rem; color: #6c757d; margin: 16px 0; font-style: italic;">${q.note}</div>`;

        // Input Area
        html += '<div style="margin-top: 32px; background: #fff; padding-top: 20px; border-top: 1px solid #eee;">';

        if (q.type === 'dropdown' && q.matches) {
            q.matches.forEach((match, i) => {
                html += `
                    <div class="match-row">
                        <label>${match.item}</label>
                        <select id="answer_${i}">
                            <option value="">Vali vastus...</option>
                            ${match.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                        </select>
                    </div>`;
            });
        } else if (q.type === 'dropdown' && q.options) {
            html += `
                <select id="answer_0" style="max-width:400px;">
                    <option value="">Vali vastus...</option>
                    ${q.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                </select>`;
        } else if (q.type === 'input' || q.type === 'calculation') {
            html += `<input type="text" id="answer_0" placeholder="Sisesta vastus" style="max-width:300px;">`;
        } else if (q.type === 'multiple-choice' && q.options) {
            html += `
                <select id="answer_0" style="max-width:400px;">
                    <option value="">Vali vastus...</option>
                    ${q.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                </select>`;
        }

        html += `
                </div> <!-- End Input Area -->
            </div> <!-- End Question Body -->
        </div> <!-- End Question Card -->
        `;

        container.innerHTML = html;
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    submitAnswer: function () {
        const q = this.state.questions[this.state.currentQuestionIndex];
        let answer;

        if (q.type === 'dropdown' && q.matches) {
            answer = q.matches.map((_, i) => {
                const el = document.getElementById(`answer_${i}`);
                return el ? el.value : '';
            });
        } else {
            const el = document.getElementById('answer_0');
            answer = el ? el.value : '';
        }

        this.state.userAnswers.push({
            questionId: q.id,
            answer: answer,
            question: q
        });

        this.state.currentQuestionIndex++;

        // Save state after every answer so we can resume
        this.saveExamState();

        this.showQuestion(this.state.currentQuestionIndex);
    },

    endExam: function (isAuto = false) {
        clearInterval(this.state.timerInterval);

        // Clear active session since exam is done
        this.clearExamState();

        // Hide resume button if it was visible
        const resumeBtn = document.getElementById('resumeBtn');
        if (resumeBtn) resumeBtn.classList.add('hidden');

        if (isAuto) {
            alert("Aeg on läbi! Eksam esitatakse automaatselt.");
        }

        document.getElementById('examScreen').classList.add('hidden');
        document.getElementById('resultsScreen').classList.remove('hidden');

        let totalScore = 0;
        let maxScore = 0;
        const chapterStats = {};

        this.state.userAnswers.forEach(item => {
            const points = this.checkAnswer(item.question, item.answer);
            totalScore += points;
            maxScore += parseFloat(item.question.points);

            const ch = item.question.chapter;
            if (!chapterStats[ch]) chapterStats[ch] = { earned: 0, possible: 0, count: 0 };
            chapterStats[ch].earned += points;
            chapterStats[ch].possible += parseFloat(item.question.points);
            chapterStats[ch].count++;
        });

        // Although technically max is 50, strictly summing points might vary slightly if data isn't perfect, 
        // but user req says "50 points max", so we assume the data supports it.
        // We render what we calculated.

        const percentage = Math.round((totalScore / maxScore) * 100) || 0;

        // Calculate Grade
        let grade = 'F';
        let gradeClass = 'grade-F';

        if (percentage >= 91) { grade = 'A'; gradeClass = 'grade-A'; }
        else if (percentage >= 81) { grade = 'B'; gradeClass = 'grade-B'; }
        else if (percentage >= 71) { grade = 'C'; gradeClass = 'grade-C'; }
        else if (percentage >= 61) { grade = 'D'; gradeClass = 'grade-D'; }
        else if (percentage >= 51) { grade = 'E'; gradeClass = 'grade-E'; }
        else { grade = 'F'; gradeClass = 'grade-F'; }

        // Render Score & Grade
        document.getElementById('finalScore').textContent = totalScore.toFixed(1);
        document.getElementById('percentage').textContent = percentage;

        const gradeEl = document.getElementById('finalGrade');
        if (gradeEl) {
            gradeEl.textContent = grade;
            gradeEl.className = 'grade-badge ' + gradeClass;
        }

        // Calculate Time Taken
        const endTime = Date.now();
        const durationSeconds = Math.floor((endTime - this.state.startTime) / 1000);

        // Save Stats
        this.saveResult(totalScore, maxScore, chapterStats, durationSeconds);

        // Show Time Taken
        const mins = Math.floor(durationSeconds / 60);
        const secs = durationSeconds % 60;
        document.getElementById('finalTime').textContent = `${mins}m ${secs}s`;

        // Render Detailed Review List (New Overhaul)
        this.renderDetailedReview(totalScore, maxScore);
    },

    // --- New Detailed Review Renderer ---
    renderDetailedReview: function () {
        const container = document.getElementById('detailedReviewList');
        if (!container) return;

        let html = '';

        this.state.userAnswers.forEach((item, idx) => {
            const points = this.checkAnswer(item.question, item.answer);
            const maxPoints = parseFloat(item.question.points);
            const isCorrect = points === maxPoints;
            const isPartial = points > 0 && points < maxPoints;

            const cardClass = isCorrect ? 'result-card-correct' : (isPartial ? 'result-card-wrong' : 'result-card-wrong');
            const badgeClass = isCorrect ? 'badge-correct' : 'badge-wrong';
            const badgeText = isCorrect ? 'Correct answer' : (isPartial ? 'Partial' : 'Wrong answer');

            // Icons
            const iconCheck = `<span class="icon-check">✓</span>`;
            const iconCross = `<span class="icon-cross">✕</span>`;

            html += `
            <div class="question-card ${cardClass}" style="margin-bottom: 40px; position:relative;">
                <div style="position:absolute; top:-12px; left:0;">
                    <span class="result-badge ${badgeClass}">${badgeText}</span>
                </div>
                
                <div class="question-header-bar" style="margin-top:10px;">
                    <span class="question-title">Question ${idx + 1}</span>
                    <span class="question-points">${points.toFixed(1)} / ${maxPoints} pts</span>
                </div>
                
                <div class="question-body">
                    <div class="question-text">${item.question.question}</div>
                    
                    ${item.question.subQuestion ? `<div class="sub-question" style="color:#d63384;">${item.question.subQuestion}</div>` : ''}

                    <!-- Answer Feedback Area -->
                    <div style="margin-top:20px; border-top:1px solid #eee; padding-top:20px;">
            `;

            // Render specific answer feedback based on type
            if (item.question.type === 'dropdown' && item.question.matches) {
                // Dropdown Matches Feedback
                item.question.matches.forEach((m, i) => {
                    const userAns = Array.isArray(item.answer) ? item.answer[i] : '';
                    const rowCorrect = userAns === m.correctAnswer;

                    html += `
                        <div class="match-row">
                            <div class="feedback-flex" style="flex:1;">
                                ${rowCorrect ? iconCheck : iconCross}
                                <label style="margin:0;">${m.item}</label>
                            </div>
                            <div style="flex:0 0 300px;">
                                <div style="padding:8px 12px; background:#eee; border:1px solid #ccc; border-radius:4px; color:#555;">
                                    ${userAns || '(tühi)'}
                                </div>
                            </div>
                        </div>`;
                });
            } else {
                // Single Answer Feedback
                html += `
                    <div class="feedback-flex">
                        ${isCorrect ? iconCheck : iconCross}
                        <div style="font-weight:600; font-size:1.1rem; color:#333;">
                            ${String(item.answer) || '(tühi)'}
                        </div>
                    </div>
                `;
            }

            // Show Correct Answer if wrong
            if (!isCorrect) {
                let correctDisplay = '';
                if (item.question.type === 'dropdown' && item.question.matches) {
                    // Build a list of correct matches "Item - Answer"
                    correctDisplay = '<ul style="margin:5px 0 0 20px; padding:0; list-style-type:disc;">';
                    item.question.matches.forEach(m => {
                        correctDisplay += `<li><strong>${m.item}</strong>: ${m.correctAnswer}</li>`;
                    });
                    correctDisplay += '</ul>';
                } else {
                    correctDisplay = item.question.correctAnswer;
                }

                html += `
                    <div class="correct-answer-box">
                        <div style="font-weight:700; margin-bottom:4px;">Õige vastus:</div> 
                        <div>${correctDisplay}</div>
                    </div>
                `;
            }

            html += `
                    </div> <!-- End Feedback -->
                </div> <!-- End Body -->
            </div> <!-- End Card -->
            `;
        });

        container.innerHTML = html;
        // Scroll to top
        window.scrollTo(0, 0);
    },

    checkAnswer: function (q, userAnswer) {
        if (q.type === 'dropdown') {
            if (q.matches) {
                // Multi-part match
                let matchesCount = 0;
                q.matches.forEach((m, i) => {
                    if (Array.isArray(userAnswer) && userAnswer[i] === m.correctAnswer) {
                        matchesCount++;
                    }
                });
                return (matchesCount / q.matches.length) * parseFloat(q.points);
            }
            return userAnswer === q.correctAnswer ? parseFloat(q.points) : 0;
        }

        if (q.type === 'input' || q.type === 'calculation') {
            const correctClean = String(q.correctAnswer).replace(/[,\s€]/g, '').replace(',', '.');
            const userClean = String(userAnswer).replace(/[,\s€]/g, '').replace(',', '.');

            const tol = q.tolerance || 0;
            const correctFloat = parseFloat(correctClean);
            const userFloat = parseFloat(userClean);

            if (isNaN(userFloat)) return 0;

            if (Math.abs(correctFloat - userFloat) <= tol) return parseFloat(q.points);

            // Allow negative sign mismatch if acceptNegative is true ?? (From original code logic)
            // Original: e.acceptNegative && Math.abs(Math.abs(r)-Math.abs(i)) <= a
            if (q.acceptNegative && Math.abs(Math.abs(correctFloat) - Math.abs(userFloat)) <= tol) {
                return parseFloat(q.points);
            }
            return 0;
        }

        // Multiple choice
        return userAnswer == q.correctAnswer ? parseFloat(q.points) : 0;
    },

    showReview: function () {
        const container = document.getElementById('reviewContainer');
        container.classList.remove('hidden');

        let html = ''; // Build HTML string

        this.state.userAnswers.forEach((item, idx) => {
            const points = this.checkAnswer(item.question, item.answer);
            const maxPoints = parseFloat(item.question.points);
            const isCorrect = points === maxPoints;
            const isPartial = points > 0 && points < maxPoints;
            const isZero = points === 0;

            let borderClass = isCorrect ? 'border-success' : (isPartial ? 'border-warning' : 'border-danger'); // Conceptual classes, implemented inline for simplicity or added to CSS

            // Map colors to our CSS vars (hardcoded here for ease)
            let color = isCorrect ? '#10b981' : (isPartial ? '#f59e0b' : '#ef4444');
            let bg = isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

            html += `
                <div class="review-item" style="border-left: 4px solid ${color};">
                    <div class="review-header" style="background: ${bg};">
                        <span style="font-weight:600; color: ${color}">${isCorrect ? 'Õige' : (isPartial ? 'Osaliselt õige' : 'Vale')}</span>
                        <span>${points.toFixed(1)} / ${maxPoints} punkti</span>
                    </div>
                    <div class="review-content">
                        <div style="margin-bottom:16px; color:#64748b; font-size:0.9em;">Küsimus ${idx + 1}</div>
                        <h4 style="margin-bottom:12px;">${item.question.question}</h4>
                        ${item.question.subQuestion ? `<div class="sub-question">${item.question.subQuestion}</div>` : ''}
                        
                        <div style="margin-top: 16px;">
                            <strong>Sinu vastus:</strong> 
                            <span style="font-family:monospace; background:#f1f5f9; padding:4px 8px; border-radius:4px;">
                                ${Array.isArray(item.answer) ? item.answer.join(', ') : (item.answer || '(tühi)')}
                            </span>
                        </div>
                        
                        ${!isCorrect ? `
                        <div style="margin-top: 12px; color: #059669;">
                            <strong>Õige vastus:</strong> 
                            ${item.question.type === 'dropdown' && item.question.matches ?
                        item.question.matches.map(m => m.correctAnswer).join(', ') :
                        item.question.correctAnswer}
                        </div>` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        container.scrollIntoView({ behavior: 'smooth' });
    },


    // --- Render Helpers (Ported & Styled) ---
    renderTable: function (data) {
        if (!data) return "";
        let t = '<div style="overflow-x:auto;"><table class="data-table">';

        // Title and Subtitle rows often span all columns
        if (data.title) {
            t += `<tr><th colspan="100" style="background:#f8f9fa; text-align:center; font-size:1.1em; border-bottom:2px solid #ccc;">${data.title}</th></tr>`;
        }
        if (data.subtitle) {
            t += `<tr><th colspan="100" style="background:#fff; text-align:center; font-weight:500; color:#666;">${data.subtitle}</th></tr>`;
        }

        if (data.type === 'accounting-equation') {
            t += '<thead>';
            // Main headers
            if (data.headers) {
                t += '<tr>';
                data.headers.forEach(h => t += `<th style="text-align: center; border-bottom: 2px solid #333;">${h}</th>`);
                t += '</tr>';
            }
            // Sub headers (e.g. + / - signs)
            if (data.subheaders) {
                t += '<tr>';
                data.subheaders.forEach(h => t += `<th style="text-align: center; border-bottom: 1px solid #333; background: #fff;">${h}</th>`);
                t += '</tr>';
            }
            t += '</thead>';
        } else {
            // Standard Table
            t += '<thead>';
            if (data.headers) {
                t += '<tr>';
                data.headers.forEach(h => t += `<th>${h}</th>`);
                t += '</tr>';
            }
            if (data.subheaders) {
                t += '<tr>';
                data.subheaders.forEach(h => t += `<th style="font-weight:600; background:#f8f9fa;">${h}</th>`);
                t += '</tr>';
            }
            t += '</thead>';
        }

        t += '<tbody>';
        if (data.rows) {
            data.rows.forEach(row => {
                // Check for metadata at the end of the row
                let rowData = [...row];
                let meta = {};
                const lastItem = rowData[rowData.length - 1];

                if (typeof lastItem === 'object' && lastItem !== null) {
                    meta = rowData.pop(); // Remove metadata from renderable items
                }

                // Apply styles based on metadata
                let rowStyle = '';
                if (meta.highlight) rowStyle += 'background-color: #fffbeb; font-weight: 600;';
                if (meta.red) rowStyle += 'color: #ef4444;';

                t += `<tr style="${rowStyle}">`;
                rowData.forEach(cell => t += `<td>${cell}</td>`);
                t += '</tr>';
            });
        }
        t += '</tbody></table></div>';
        return t;
    },

    // A simplified generic render for the specialized objects
    // In a full refactor, these would be separate robust components, 
    // but preserving the original logic structure for safety.
    renderSideBySideTables: function (tables) {
        if (!tables) return "";
        let html = '<div style="display: flex; gap: 20px; flex-wrap: wrap; margin: 24px 0;">';
        tables.forEach(tbl => {
            html += `<div style="flex: 1; min-width: 300px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; background: #fff;">
                <div style="font-weight: 600; margin-bottom: 4px;">${tbl.title}</div>
                <div style="font-size: 0.85em; color: #64748b; margin-bottom: 12px;">${tbl.subtitle}</div>
                <table style="width: 100%; font-size: 0.9em; border-collapse: collapse;">`;
            tbl.rows.forEach(r => {
                const style = r.highlight ? 'background: #fffbeb;' : '';
                const color = r.red ? 'color: #ef4444;' : '';
                html += `<tr style="${style}">
                    <td style="padding: 6px; border-bottom: 1px solid #f1f5f9; ${color}">${r.label}</td>
                    <td style="padding: 6px; text-align: right; border-bottom: 1px solid #f1f5f9; ${color}">${r.value} ${tbl.currency || ''}</td>
                </tr>`;
            });
            html += `</table></div>`;
        });
        html += '</div>';
        return html;
    },

    renderInventoryData: function (data) {
        if (!data) return "";
        let html = '<div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">';
        data.forEach(d => {
            const style = d.highlight ? 'font-weight: 600; color: #0f172a;' : 'color: #334155;';
            html += `<div style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; ${style}">
                <span style="display:inline-block; width: 100px; color: #64748b;">${d.date}:</span>
                ${d.description}
            </div>`;
        });
        html += '</div>';
        return html;
    },

    renderBondDetails: function (data) {
        if (!data) return "";
        let html = `<div style="background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 8px; padding: 20px; margin: 16px 0;">
            <h4 style="color: #0d9488; margin-bottom: 12px; text-align:center;">${data.title}</h4>`;
        data.info.forEach(item => {
            html += `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #99f6e4;">
                <span style="color: #0f766e;">${item.label}</span>
                <span style="font-weight: 500;">${item.value}</span>
            </div>`;
        });
        html += '</div>';
        return html;
    },

    renderBondPriceInfo: function (info) {
        return `<div style="background: #fff; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <div style="display:grid; grid-template-columns: auto 1fr; gap: 8px 20px;">
                <strong>Kuupäev:</strong> <span>${info.date}</span>
                <strong>Nimiväärtus:</strong> <span>${info.nominal}</span>
                <strong>Ostuhind:</strong> <span>${info.buyPrice}</span>
                ${info.sellPrice ? `<strong>Müügihind:</strong> <span>${info.sellPrice}</span>` : ''}
            </div>
            ${info.note ? `<div style="margin-top:12px; font-style:italic; color:#64748b;">${info.note}</div>` : ''}
        </div>`;
    },

    renderEquityStatement: function (data) {
        // Keeping it simple table structure
        if (!data) return "";
        let html = '<div style="overflow-x:auto; margin: 24px 0;"><table class="data-table" style="min-width: 500px;">';

        // Share capital
        data.shareCapital.forEach(row => {
            html += `<tr><td>${row.name} <sm>${row.details}</sm></td><td class="text-right">${row.amount.toLocaleString()} €</td></tr>`;
        });
        html += `<tr style="font-weight:700; background:#f8fafc;"><td>Aktsiakapital kokku</td><td class="text-right">${data.shareCapitalTotal.toLocaleString()} €</td></tr>`;

        // Addl Paid in
        data.additionalPaidInCapital.forEach(row => {
            html += `<tr><td>${row.name}</td><td class="text-right">${row.amount.toLocaleString()} €</td></tr>`;
        });
        html += `<tr style="font-weight:700; background:#f8fafc;"><td>Lisaks makstud kapital kokku</td><td class="text-right">${data.additionalPaidInCapitalTotal.toLocaleString()} €</td></tr>`;

        // Treasury & Retained
        if (data.treasuryStock) {
            html += `<tr><td>${data.treasuryStock.name}</td><td class="text-right">${data.treasuryStock.amount.toLocaleString()} €</td></tr>`;
        }

        html += `<tr style="font-weight:700;"><td>Aktsiakapital kokku</td><td class="text-right">${data.totalStockCapital.toLocaleString()} €</td></tr>`;
        html += `<tr><td>Jaotamata kasum</td><td class="text-right">${data.retainedEarnings.toLocaleString()} €</td></tr>`;
        html += `<tr style="font-weight:800; background:#e2e8f0;"><td>Omakapital kokku</td><td class="text-right">${data.totalEquity.toLocaleString()} €</td></tr>`;

        html += '</table></div>';
        return html;
    },

    renderTimeline: function (data) {
        if (!data) return "";
        // Toggle specific renderer
        if (data.type === 'payment-timeline') {
            return this.renderPaymentTimeline(data);
        }

        if (!data.events) return "";
        let html = '<div class="timeline-container">';
        data.events.forEach(e => {
            let color = e.type === 'loan' ? '#e0f2fe' : (e.type === 'payment' ? '#ffedd5' : '#f8fafc');
            let border = e.type === 'loan' ? '#38bdf8' : (e.type === 'payment' ? '#fb923c' : '#e2e8f0');
            // Adding specific styling for Loan vs Payment
            let label = e.type === 'loan' ? 'LAEN' : (e.type === 'payment' ? 'MAKSE' : 'SÜNDMUS');
            let labelColor = e.type === 'loan' ? '#0284c7' : (e.type === 'payment' ? '#ea580c' : '#64748b');

            html += `<div class="timeline-event" style="background: ${color}; border: 1px solid ${border};">
                <div style="font-size: 0.7em; font-weight: 700; letter-spacing: 0.05em; color: ${labelColor}; margin-bottom: 6px;">${label}</div>
                <div style="font-weight: 700; font-size: 1.1em; margin-bottom: 4px; color: var(--primary);">${e.date}</div>
                ${e.amount ? `<div style="font-family: monospace; font-size: 1.1em;">${e.amount}</div>` : ''}
            </div>`;
        });
        html += '</div>';
        return html;
    },

    renderPaymentTimeline: function (data) {
        // Group events by year to draw braces if needed, or just iterate flat
        // The screenshot implies a continuous axis.

        let html = '<div class="cashflow-container"><div class="cashflow-axis-wrapper">';

        // Items
        html += '<div>';
        data.events.forEach(e => {
            if (e.type === 'empty') {
                // Gap year
                html += `<div class="cashflow-item">
                    <div style="height:35px;"></div> <!-- Spacer for amount -->
                    <div class="cashflow-tick" style="height:10px; width:1px; background:#ccc;"></div>
                    <div class="cashflow-date" style="color:#ccc;">${e.date}</div>
                    <div class="cashflow-brace" style="border-color:#eee;"><div style="background:#eee;"></div></div>
                    <div class="cashflow-year" style="color:#ccc;">${e.year}</div>
                </div>`;
                return;
            }

            const isNegative = e.amount && e.amount.includes('-');
            const colorClass = isNegative ? 'negative' : 'positive';
            const amountText = e.amount ? e.amount : '';

            html += `<div class="cashflow-item">
                <div class="cashflow-amount ${colorClass}">${amountText}</div>
                <div class="cashflow-tick"></div>
                <!-- Axis line runs below these via parent border -->
                <div class="cashflow-date">${e.date}</div>
                <div class="cashflow-brace"></div>
                <div class="cashflow-year">${e.year}</div>
            </div>`;
        });
        html += '</div>';

        // Axis Line (absolute positioned or just border of a wrapper? 
        // We used border-bottom on 'cashflow-axis' in CSS plan, but here I structure it as items.
        // Let's inject the axis line div *behind* or *under* the items.
        // Actually, CSS .cashflow-axis-wrapper items are inline-block. 
        // We can put a div *under* the amounts but *above* the dates to act as the line.

        html += '<div class="cashflow-axis"></div><div class="cashflow-label-aeg">aeg</div>';

        html += '</div></div>';
        return html;
    },

    renderAdditionalInfo: function (info) {
        if (!info) return "";
        return `<div style="background: #f8fafc; border-left: 4px solid var(--primary); padding: 16px; margin: 16px 0;">
            ${info.map(line => `<div>${line}</div>`).join('')}
        </div>`;
    }
};

// Start the app logic when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
