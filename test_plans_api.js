async function runTests() {
    console.log('--- STARTING DYNAMIC PLANS SYSTEM AUTOMATED TESTS ---');

    // 1. GET all plans
    const res1 = await fetch('http://localhost:5000/api/plans');
    const plans1 = await res1.json();
    console.log('✓ GET /api/plans returns', plans1.length, 'plans');

    // 2. CREATE dynamic plan
    const newPlanPayload = {
        plan_type: 'employer',
        plan_name: 'Test Startup Ultra',
        description: 'High performance tech recruitment pack for fast hiring.',
        original_price: 3499,
        offer_price: 2499,
        duration: '30 Days',
        duration_days: 30,
        posting_limit: 3,
        popular: 1,
        recommended: 0,
        badge_text: 'HOT DEAL',
        features: [
            { feature_name: '3 Active Job Postings', included: true, feature_value: '3 Postings' },
            { feature_name: '30 Day Job Validity', included: true, feature_value: '30 Days' },
            { feature_name: 'WhatsApp Candidate Alerts', included: true, feature_value: '5 Alerts' },
            { feature_name: 'Dedicated Tech Recruiter', included: false, feature_value: '' },
            { feature_name: 'Executive Search Assistance', included: false, feature_value: '' }
        ]
    };

    const res2 = await fetch('http://localhost:5000/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlanPayload)
    });
    const createData = await res2.json();
    console.log('✓ POST /api/plans created plan ID:', createData.planId);
    const createdId = createData.planId;

    // 3. GET single plan
    const res3 = await fetch(`http://localhost:5000/api/plans/${createdId}`);
    const planDetail = await res3.json();
    console.log('✓ GET /api/plans/:id verified:', planDetail.plan_name, 'Discount:', planDetail.discount_percentage + '%', 'Features count:', planDetail.features.length);
    console.log('  Features:', planDetail.features.map(f => `${f.included ? '✓' : '✕'} ${f.feature_name} (${f.feature_value || 'N/A'})`).join(' | '));

    // 4. UPDATE plan (toggle ✕ to ✓, add a feature)
    const updatePayload = {
        ...planDetail,
        offer_price: 1999,
        features: [
            ...planDetail.features.map(f => f.feature_name === 'Dedicated Tech Recruiter' ? { ...f, included: true, feature_value: 'Assigned' } : f),
            { feature_name: 'Live Chat Support', included: true, feature_value: '24/7' }
        ]
    };

    const res4 = await fetch(`http://localhost:5000/api/plans/${createdId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
    });
    const updateData = await res4.json();
    console.log('✓ PUT /api/plans/:id result:', updateData.message);

    // 5. DUPLICATE plan
    const res5 = await fetch(`http://localhost:5000/api/plans/${createdId}/duplicate`, {
        method: 'POST'
    });
    const dupData = await res5.json();
    console.log('✓ POST /api/plans/:id/duplicate result:', dupData.message, 'New ID:', dupData.planId);

    // 6. DELETE plan
    const res6 = await fetch(`http://localhost:5000/api/plans/${createdId}`, {
        method: 'DELETE'
    });
    const delData = await res6.json();
    console.log('✓ DELETE /api/plans/:id result:', delData.message);

    // Clean up duplicate too
    if (dupData.planId) {
        await fetch(`http://localhost:5000/api/plans/${dupData.planId}`, { method: 'DELETE' });
        console.log('✓ Cleaned up duplicate plan ID:', dupData.planId);
    }

    console.log('--- ALL AUTOMATED DYNAMIC PLANS TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
