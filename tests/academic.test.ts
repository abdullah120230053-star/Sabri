import { expect,it } from 'vitest';
import { courseSchema,emptyState,habitLogSchema,habitSchema,sessionSchema,stamp } from '../src/shared/schema';
import { gpa,gpaRequirement,habitStreak,requiredGrade,studyStats,weightedGrade } from '../src/shared/academic';
const course = (name: string, creditHours: number, finalGrade: string) => courseSchema.parse({ ...stamp(),name,creditHours,finalGrade,code:'',instructor:'',color:'#123456',semester:'Fall',gradeComponents:[],absenceLimit:0,absences:0 });
it('weights grade points by credits and estimates the remaining GPA required',() => {
  const courses=[course('A',3,'A'),course('B',1,'B'),course('C',4,'')];
  expect(gpa(courses,{ A:4,B:3 })).toEqual({ credits:4,value:3.75 });
  expect(gpaRequirement(courses,{ A:4,B:3 },3.5)).toBe(3.25);
  const parts=[{ id:'one',name:'Midterm',weight:60,maxScore:40,earnedScore:32 },{ id:'two',name:'Final',weight:40,maxScore:80 }];
  expect(weightedGrade(parts,{ id:'two',percent:85 })).toBe(82);
  expect(requiredGrade(parts,'two',82)).toBe(85);
});
it('counts a current streak across the days when the habit applies',() => {
  const habit=habitSchema.parse({ ...stamp(undefined,'2026-11-01T00:00:00Z'),name:'Review',icon:'✦',color:'#124323',category:'',frequency:'specific_days',targetDays:[1,3],targetCount:1,unit:'',archived:false });
  const logs=['2026-11-16','2026-11-18'].map((date) => habitLogSchema.parse({ ...stamp(),habitId:habit.id,date,value:1 }));
  expect(habitStreak(habit,logs,'2026-11-20',6)).toBe(2);
});
it('aggregates completed focus sessions in the saved time zone',() => {
  const state=emptyState();
  state.sessions.push(sessionSchema.parse({ ...stamp(),startedAt:'2026-11-19T21:40:00Z',endedAt:'2026-11-19T22:05:00Z',type:'focus',plannedMinutes:25,actualMinutes:25,completed:true }));
  const stats=studyStats(state,'2026-11-20',1);
  expect(stats.daily.get('2026-11-20')).toBe(25);
  expect(stats.sessions).toBe(1);
});

