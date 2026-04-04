// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding HireIQ database...')

  // Demo agency
  const agency = await prisma.agency.upsert({
    where: { slug: 'salt-recruitment' },
    update: {},
    create: {
      name: 'Salt Recruitment',
      slug: 'salt-recruitment',
      subscriptionTier: 'pilot',
      emailFromName: 'Salt Recruitment Hiring',
      emailFromAddress: 'hiring@saltrecruitment.ae',
      isActive: true,
    },
  })
  console.log(`✅ Agency: ${agency.name} (${agency.id})`)

  // Demo admin user
  const admin = await prisma.user.upsert({
    where: { agencyId_email: { agencyId: agency.id, email: 'admin@saltrecruitment.ae' } },
    update: {},
    create: {
      agencyId: agency.id,
      email: 'admin@saltrecruitment.ae',
      fullName: 'Sarah Mitchell',
      role: 'agency_admin',
      status: 'active',
    },
  })
  console.log(`✅ Admin user: ${admin.fullName} (${admin.email})`)

  // Demo recruiter
  const recruiter = await prisma.user.upsert({
    where: { agencyId_email: { agencyId: agency.id, email: 'recruiter@saltrecruitment.ae' } },
    update: {},
    create: {
      agencyId: agency.id,
      email: 'recruiter@saltrecruitment.ae',
      fullName: 'Ahmed Al-Rashidi',
      role: 'senior_recruiter',
      status: 'active',
    },
  })
  console.log(`✅ Recruiter: ${recruiter.fullName}`)

  // Demo job
  const job = await prisma.job.upsert({
    where: { applyUrlSlug: 'senior-finance-analyst-damac' },
    update: {},
    create: {
      agencyId: agency.id,
      recruiterId: recruiter.id,
      title: 'Senior Finance Analyst',
      hiringCompany: 'DAMAC Properties',
      locationCountry: 'AE',
      locationCity: 'Dubai',
      jobType: 'onsite',
      salaryMin: 18000,
      salaryMax: 26000,
      currency: 'AED',
      requiredSkills: ['IFRS', 'Financial Modeling', 'Excel', 'SAP'],
      preferredSkills: ['Power BI', 'CFA'],
      minExperienceYears: 5,
      requiredLanguages: ['English', 'Arabic'],
      jdText: `We are looking for a Senior Finance Analyst to join DAMAC Properties in Dubai. 
The ideal candidate will have strong IFRS knowledge, financial modeling experience, and a minimum of 5 years in a similar role within the real estate or construction sector.

Key Responsibilities:
- Prepare monthly financial reports and variance analysis
- Build and maintain financial models for project feasibility
- Ensure compliance with IFRS standards
- Support external audit processes
- Present financial insights to senior management

Requirements:
- Bachelor's degree in Finance, Accounting or related field
- Minimum 5 years experience in financial analysis
- Strong proficiency in Excel and SAP
- Excellent knowledge of IFRS
- Bilingual English and Arabic preferred`,
      extractedCriteria: {
        mustHave: ['IFRS knowledge', '5+ years experience', 'Financial modeling', 'Excel proficiency', 'SAP'],
        niceToHave: ['Power BI', 'CFA certification', 'Real estate sector experience'],
        seniorityLevel: 'Senior',
        roleCategory: 'Finance & Accounting',
      },
      screeningQuestions: [
        {
          id: 'q1', type: 'experience',
          questionTextEn: 'How many years of financial analysis experience do you have, and which industries have you worked in?',
          questionTextAr: 'كم سنة لديك من خبرة التحليل المالي، وفي أي قطاعات عملت؟',
          rationale: 'Validates experience depth and sector relevance',
        },
        {
          id: 'q2', type: 'skill_probe',
          questionTextEn: 'Can you describe a financial model you built recently — what was it for and what was the outcome?',
          questionTextAr: 'هل يمكنك وصف نموذج مالي قمت ببنائه مؤخراً — ما هو الغرض منه وما كانت النتيجة؟',
          rationale: 'Tests financial modeling depth with a specific example',
        },
        {
          id: 'q3', type: 'salary',
          questionTextEn: 'What is your current salary and what are your expectations for this role?',
          questionTextAr: 'ما هو راتبك الحالي وما هي توقعاتك لهذا الدور؟',
          rationale: 'Early salary alignment check',
        },
        {
          id: 'q4', type: 'availability',
          questionTextEn: 'What is your notice period and when could you start?',
          questionTextAr: 'ما هي فترة الإشعار لديك ومتى يمكنك البدء؟',
          rationale: 'Availability and urgency check',
        },
        {
          id: 'q5', type: 'motivation',
          questionTextEn: 'What specifically attracted you to this role at DAMAC, and what do you know about their current projects?',
          questionTextAr: 'ما الذي جذبك تحديداً لهذا الدور في داماك، وماذا تعرف عن مشاريعهم الحالية؟',
          rationale: 'Tests genuine interest vs mass application',
        },
      ],
      applyUrlSlug: 'senior-finance-analyst-damac',
      waShortcode: 'JB001',
      status: 'active',
      activatedAt: new Date(),
    },
  })
  console.log(`✅ Demo job: ${job.title} at ${job.hiringCompany}`)

  // Demo candidates with realistic data
  const candidates = [
    {
      fullName: 'Mohammed Al-Farsi',
      currentRole: 'Finance Analyst',
      yearsExperience: 7,
      salaryExpectation: 22000,
      noticePeriodDays: 30,
      visaStatus: 'UAE_employment_visa',
      compositeScore: 87,
      cvMatchScore: 84,
      commitmentScore: 92,
      salaryFitScore: 100,
      pipelineStage: 'shortlisted' as const,
      aiSummary: 'Seven years of finance experience in UAE real estate with strong IFRS background confirmed in screening. Currently at Emaar with comparable role scope. Salary expectations align with the offered range. Available in 30 days. Main gap: limited SAP exposure — uses Oracle primarily.',
      dataTags: { seniorityLevel: 'Senior', roleCategory: 'Finance & Accounting', languageCapability: 'Bilingual Arabic-English', availability: '30 Days', sourceChannel: 'linkedin', cvType: 'full_cv' },
    },
    {
      fullName: 'Nadia Hassan',
      currentRole: 'Senior Financial Analyst',
      yearsExperience: 9,
      salaryExpectation: 28000,
      noticePeriodDays: 60,
      visaStatus: 'UAE_employment_visa',
      compositeScore: 74,
      cvMatchScore: 91,
      commitmentScore: 78,
      salaryFitScore: 40,
      pipelineStage: 'evaluated' as const,
      aiSummary: 'Strong CV with 9 years including 4 in UAE real estate. Excellent IFRS and SAP proficiency. Salary expectation of AED 28,000 is above the maximum budget — flagged for discussion. 60-day notice period. Screening answers were specific and detailed.',
      dataTags: { seniorityLevel: 'Senior', roleCategory: 'Finance & Accounting', languageCapability: 'Bilingual Arabic-English', availability: '60 Days', sourceChannel: 'bayt', cvType: 'full_cv' },
    },
    {
      fullName: 'Khalid Al-Shamsi',
      currentRole: 'Finance Manager',
      yearsExperience: 12,
      salaryExpectation: 35000,
      noticePeriodDays: 90,
      visaStatus: 'UAE_citizen',
      compositeScore: 61,
      cvMatchScore: 72,
      commitmentScore: 55,
      salaryFitScore: 0,
      pipelineStage: 'evaluated' as const,
      aiSummary: 'Overqualified at Finance Manager level with 12 years experience. Salary expectation significantly exceeds budget. Screening answers were vague — did not provide specific examples when probed. UAE national which may be relevant for Emiratization considerations.',
      dataTags: { seniorityLevel: 'Manager', roleCategory: 'Finance & Accounting', languageCapability: 'Bilingual Arabic-English', availability: '90 Days', sourceChannel: 'direct_link', cvType: 'full_cv' },
    },
    {
      fullName: 'Sarah Thompson',
      currentRole: 'Financial Analyst',
      yearsExperience: 4,
      salaryExpectation: 16000,
      noticePeriodDays: 0,
      visaStatus: 'UAE_employment_visa',
      compositeScore: 55,
      cvMatchScore: 58,
      commitmentScore: 72,
      salaryFitScore: 80,
      pipelineStage: 'applied' as const,
      aiSummary: 'Below minimum experience threshold at 4 years. Strong commitment signals in screening — gave specific examples and showed genuine knowledge of DAMAC. Salary expectations are within range. May be worth considering if senior candidates do not convert.',
      dataTags: { seniorityLevel: 'Mid-Level', roleCategory: 'Finance & Accounting', languageCapability: 'English Only', availability: 'Immediate', sourceChannel: 'linkedin', cvType: 'full_cv' },
    },
  ]

  for (const cd of candidates) {
    await prisma.candidate.upsert({
      where: { id: cd.fullName.toLowerCase().replace(/\s/g, '-') + '-id' },
      update: {},
      create: {
        id: undefined,
        agencyId: agency.id,
        jobId: job.id,
        waNumberHash: Buffer.from(cd.fullName).toString('hex').slice(0, 64),
        waNumberEncrypted: 'encrypted_' + cd.fullName.replace(/\s/g, '_').toLowerCase(),
        preferredLanguage: cd.dataTags.languageCapability?.includes('Arabic') ? 'ar' : 'en',
        consentGiven: true,
        consentTimestamp: new Date(),
        fullName: cd.fullName,
        currentRole: cd.currentRole,
        yearsExperience: cd.yearsExperience,
        salaryExpectation: cd.salaryExpectation,
        noticePeriodDays: cd.noticePeriodDays,
        visaStatus: cd.visaStatus,
        cvType: 'full_cv',
        authenticityFlag: 'none',
        commitmentScore: cd.commitmentScore,
        cvMatchScore: cd.cvMatchScore,
        salaryFitScore: cd.salaryFitScore,
        compositeScore: cd.compositeScore,
        hardFilterPass: cd.compositeScore > 50,
        aiSummary: cd.aiSummary,
        dataTags: cd.dataTags,
        pipelineStage: cd.pipelineStage,
        conversationState: 'completed',
        shortlistedAt: cd.pipelineStage === 'shortlisted' ? new Date() : null,
        sourceChannel: cd.dataTags.sourceChannel,
      },
    }).catch(() => {
      // Skip if already exists
    })
  }
  console.log(`✅ Demo candidates: ${candidates.length} seeded`)

  console.log('\n🎉 Database seeded successfully!')
  console.log('\nDemo credentials:')
  console.log('  Agency: Salt Recruitment')
  console.log('  Admin:  admin@saltrecruitment.ae')
  console.log('  Apply link: http://localhost:3000/apply/senior-finance-analyst-damac')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
